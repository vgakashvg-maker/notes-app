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
import { corsServe } from "../_shared/cors.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// BUG-012: env reads happen lazily inside the handler. Doing them at
// module load would throw on a missing GOOGLE_CLIENT_ID before
// corsServe could register, and the runtime would 500 the OPTIONS
// preflight — breaking CORS for every browser caller. Lazy reads also
// let unrelated POSTs (where a missing env IS a real error) return a
// structured 503 instead of a worker crash.
const PROVIDER_TO_COLUMN: Record<ExternalProviderId, string> = {
  GOOGLE_DRIVE: "google_drive_refresh_token",
  GOOGLE_CALENDAR: "google_calendar_refresh_token",
  GOOGLE_USERINFO: "google_userinfo_refresh_token",
};

corsServe(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }

  // Read env per-request. Missing env is a 503, not a worker crash.
  const env = readEnv();
  if (!env.ok) {
    return jsonError(503, "ERR_NOT_CONFIGURED", env.message);
  }

  const userId = await resolveUserId(req, env.value);
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
    lookupRefreshToken: (uid, provider) => lookupRefreshTokenForUser(uid, provider, env.value),
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

interface Env {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
}

type EnvResult = { ok: true; value: Env } | { ok: false; message: string };

function readEnv(): EnvResult {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ] as const;
  const missing: string[] = [];
  const values: Record<string, string> = {};
  for (const name of required) {
    const v = Deno.env.get(name);
    if (v === undefined || v.length === 0) missing.push(name);
    else values[name] = v;
  }
  if (missing.length > 0) {
    return { ok: false, message: `Missing env: ${missing.join(", ")}` };
  }
  return {
    ok: true,
    value: {
      supabaseUrl: values.SUPABASE_URL!,
      serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY!,
      googleClientId: values.GOOGLE_CLIENT_ID!,
      googleClientSecret: values.GOOGLE_CLIENT_SECRET!,
    },
  };
}

async function resolveUserId(req: Request, env: Env): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice("bearer ".length).trim();
  if (jwt.length === 0) return null;
  // Supabase exposes the GoTrue user lookup endpoint; using it (instead of
  // verifying the JWT ourselves) sidesteps the need to ship the JWT secret
  // to this function.
  const resp = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: env.serviceRoleKey,
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

async function lookupRefreshTokenForUser(
  userId: string,
  provider: ExternalProviderId,
  env: Env,
): Promise<RefreshTokenRecord | null> {
  const column = PROVIDER_TO_COLUMN[provider];
  const resp = await fetch(
    `${env.supabaseUrl}/rest/v1/users_profile?user_id=eq.${userId}&select=${column}`,
    {
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
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
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
  };
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
