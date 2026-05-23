// Edge Function: POST /functions/v1/auth/refresh-provider-token
//
// Thin Deno wrapper around the pure logic in
// `packages/auth/src/refresh-provider-token.ts`. The wrapper:
//   1. Resolves the caller's userId from the Supabase JWT.
//   2. Looks up the encrypted refresh-token column for the requested
//      provider via the service-role connection.
//   3. Delegates to the shared `refreshProviderToken` function.
//
// Run with: supabase functions serve auth/refresh-provider-token
//
// deno-lint-ignore-file no-explicit-any

import {
  parseRequest,
  refreshProviderToken,
  type RefreshTokenRecord,
} from "../../../packages/auth/src/refresh-provider-token.ts";
import type { ExternalProviderId } from "../../../packages/domain/src/auth.ts";

// Deno globals — present in the function runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = mustEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = mustEnv("GOOGLE_CLIENT_SECRET");

const PROVIDER_TO_COLUMN: Record<ExternalProviderId, string> = {
  GOOGLE_DRIVE: "google_drive_refresh_token",
  GOOGLE_CALENDAR: "google_calendar_refresh_token",
  GOOGLE_USERINFO: "google_userinfo_refresh_token",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }

  const userId = await resolveUserId(req);
  if (userId === null) {
    return jsonError(401, "ERR_UNAUTHENTICATED", "Missing or invalid bearer token.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be valid JSON.");
  }

  const request = parseRequest(body);
  if (request === null) {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be { provider: ExternalProviderId }.");
  }

  const result = await refreshProviderToken(userId, request, {
    fetcher: fetch,
    lookupRefreshToken: lookupRefreshTokenForUser,
  });

  if (!result.ok) {
    return new Response(JSON.stringify(result), {
      status: result.error.code === "ERR_NO_REFRESH_TOKEN" ? 409 : 502,
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

async function resolveUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  if (jwt.length === 0) return null;
  // Supabase exposes the GoTrue user lookup endpoint; using it (instead of
  // verifying the JWT ourselves) sidesteps the need to ship the JWT secret
  // to this function.
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

async function lookupRefreshTokenForUser(
  userId: string,
  provider: ExternalProviderId,
): Promise<RefreshTokenRecord | null> {
  const column = PROVIDER_TO_COLUMN[provider];
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/users_profile?user_id=eq.${userId}&select=${column}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        // PostgREST decrypts the bytea column for us when the service role
        // has the pgsodium key in scope; see the migration.
      },
    },
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as Array<Record<string, unknown>>;
  const raw = rows[0]?.[column];
  if (typeof raw !== "string" || raw.length === 0) return null;
  return {
    refreshToken: raw,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  };
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
