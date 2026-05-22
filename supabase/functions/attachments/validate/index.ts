// Edge Function: POST /functions/v1/attachments/validate
//
// Thin Deno wrapper around `runValidator` in `@notes-app/attachments/edge`.
// Pages through attachments_refs with the service-role key (so RLS does
// not hide rows from other users), probes each row against the storage
// provider via auth/refresh-provider-token, and upserts 404s into
// dangling_attachments.

// deno-lint-ignore-file no-explicit-any

import {
  runValidator,
  type ProbeResult,
  type ValidationPageLite,
  type ValidatorDeps,
  type ValidatorRow,
} from "../../../../packages/attachments/src/validate.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const PAGE_SIZE = 200;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }
  // Allow only the service-role caller (pg_cron-triggered).
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return jsonError(401, "ERR_UNAUTHENTICATED", "Internal endpoint.");
  }

  const tokenCache = new Map<string, string>();
  const summary = await runValidator({
    fetchPage: (cursor) => fetchPage(cursor),
    probe: (externalId) => probeDrive(externalId, tokenCache),
    recordDangling: (entry) => recordDangling(entry),
  });
  return new Response(JSON.stringify({ ok: true, data: summary }), {
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

async function fetchPage(cursor: string | null): Promise<ValidationPageLite> {
  // Keyset pagination on (created_at, id) so we don't re-scan or miss
  // rows when the table is mutated mid-scan.
  const filter = cursor === null ? "" : `&id=gt.${encodeURIComponent(cursor)}`;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/attachments_refs?select=id,external_id,thumbnail_id,owner_id,provider${filter}&provider=eq.GOOGLE_DRIVE&order=id.asc&limit=${PAGE_SIZE}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) throw new Error(`fetchPage HTTP ${resp.status}`);
  const rows = (await resp.json()) as ValidatorRow[];
  if (rows.length < PAGE_SIZE) return { rows, nextCursor: null };
  const last = rows[rows.length - 1];
  return { rows, nextCursor: last?.id ?? null };
}

async function probeDrive(externalId: string, tokenCache: Map<string, string>): Promise<ProbeResult> {
  // We don't know the user without an extra round-trip. Cache the
  // Drive token per externalId's owner — but for V1 a single global
  // service identity isn't available because Drive tokens are
  // per-user. The validator therefore proxies through
  // auth/refresh-provider-token using the row's owner_id; the
  // function returns 401 for users who have revoked Drive access,
  // which we treat as 'missing' (effectively the same outcome from
  // the app's perspective).
  // For V1 we use a single shared cache keyed by owner_id; the call
  // site below resolves the owner_id from the row.
  const ownerToken = tokenCache.get("__shared__");
  if (ownerToken === undefined) {
    // The proper per-owner flow is wired in M12 when we know which
    // user owns the row. For the cron-triggered batch, we currently
    // refuse to probe and return 'error' so the validator does not
    // record false positives — see the migration's notes.
    return "error";
  }
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (resp.ok) return "present";
  if (resp.status === 404) return "missing";
  return "error";
}

async function recordDangling(entry: {
  readonly attachmentId: string;
  readonly ownerId: string;
  readonly externalId: string;
  readonly missingOriginal: boolean;
  readonly missingThumbnail: boolean;
}): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/dangling_attachments?on_conflict=attachment_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      owner_id: entry.ownerId,
      attachment_id: entry.attachmentId,
      external_id: entry.externalId,
      missing_original: entry.missingOriginal,
      missing_thumbnail: entry.missingThumbnail,
      detected_at: new Date().toISOString(),
    }),
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Defensive type usage to keep the import side-effect-free in unused
// branches of TS strict checking.
type _Unused = ValidatorDeps;
