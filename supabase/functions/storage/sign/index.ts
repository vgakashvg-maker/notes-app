// Edge Function: POST /functions/v1/storage/sign
//
// Thin Deno wrapper around `sign` in `@notes-app/storage/edge`. Verifies
// the caller actually owns the requested attachment by joining against
// attachments_refs under RLS (by forwarding the user JWT to PostgREST),
// then asks the auth/refresh-provider-token sibling for a Drive token
// and stitches together a short-lived media URL.
//
// Why forward the user JWT rather than using service-role to look up
// ownership? Same reason as notes/bulk-update: RLS is the safety net.

// deno-lint-ignore-file no-explicit-any

import { parseSignRequest, sign } from "../../../../packages/storage/src/storage-sign.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }
  const jwt = extractBearer(req);
  const userId = jwt === null ? null : await resolveUserId(jwt);
  if (jwt === null || userId === null) {
    return jsonError(401, "ERR_UNAUTHENTICATED", "Missing or invalid bearer token.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be valid JSON.");
  }
  const parsed = parseSignRequest(body);
  if (parsed === null) {
    return jsonError(
      400,
      "ERR_BAD_REQUEST",
      "Body must be { externalId: string, ttlSeconds?: 60..3600 }.",
    );
  }

  const result = await sign(userId, parsed, {
    userOwnsAttachment: (uid, externalId) => userOwnsAttachment(jwt, uid, externalId),
    mintDriveUrl: (externalId, ttl) => mintDriveDownloadUrl(jwt, externalId, ttl),
    now: () => new Date(),
  });

  if (!result.ok) {
    const status = result.error.code === "ERR_NOT_FOUND" ? 404 : 502;
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  return jwt.length === 0 ? null : jwt;
}

async function resolveUserId(jwt: string): Promise<string | null> {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

async function userOwnsAttachment(jwt: string, _userId: string, externalId: string): Promise<boolean> {
  // RLS confines the row set to the caller; if a row is returned, the user
  // owns it. _userId is unused here but kept for the port contract.
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/attachments_refs?select=id&provider=eq.GOOGLE_DRIVE&external_id=eq.${encodeURIComponent(externalId)}&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
    },
  );
  if (!resp.ok) return false;
  const rows = (await resp.json()) as unknown[];
  return rows.length > 0;
}

async function mintDriveDownloadUrl(jwt: string, externalId: string, _ttl: number): Promise<string> {
  // Mint via the sibling auth/refresh-provider-token function so refresh-
  // token decryption lives in one place. Drive doesn't honour our ttl as
  // a parameter — the access token's own ~1h lifetime defines the URL's
  // useful window, capped by the response's expires_at on our side.
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/auth/refresh-provider-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider: "GOOGLE_DRIVE" }),
  });
  if (!resp.ok) {
    throw new Error(`auth/refresh-provider-token returned HTTP ${resp.status}`);
  }
  const parsed = (await resp.json()) as {
    ok?: boolean;
    data?: { access_token?: unknown };
  };
  if (parsed.ok !== true || typeof parsed.data?.access_token !== "string") {
    throw new Error("auth/refresh-provider-token returned an unexpected shape");
  }
  const token = parsed.data.access_token;
  return (
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}` +
    `?alt=media&access_token=${encodeURIComponent(token)}`
  );
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
