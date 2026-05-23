// Edge Function: POST /functions/v1/embeddings/index
//
// Thin Deno wrapper around `indexNote` in `@notes-app/embeddings/edge`.
// Receives { noteId, namespace } payloads from the trigger
// (notes_embed_trigger in the M10 migration) or from the backfill
// script. Service-role authenticated.
//
// Talks to Ollama via the OLLAMA_ENDPOINT_URL (Tailscale Funnel),
// passing the Host: 127.0.0.1:11434 header to dodge Ollama's
// host-check (see ADR 0008).

// deno-lint-ignore-file no-explicit-any

import {
  createOllamaEmbedClient,
  indexNote,
  type ChunkRow,
  type NoteSnapshot,
} from "../../../packages/embeddings/src/index.ts";

import { corsServe } from "../_shared/cors.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const OLLAMA_ENDPOINT_URL = mustEnv("OLLAMA_ENDPOINT_URL");

corsServe(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }
  // Internal endpoint — only service-role JWTs are allowed. We accept
  // any token signed with the project's JWT secret whose payload's role
  // claim is `service_role`. (String-equality with SUPABASE_SERVICE_ROLE_KEY
  // is brittle when the platform's injected env var drifts from the
  // currently-issued key.)
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!isServiceRoleJwt(token)) {
    return jsonError(401, "ERR_UNAUTHENTICATED", "Internal endpoint.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "ERR_BAD_REQUEST", "Body must be valid JSON.");
  }
  const noteId = (body as { noteId?: unknown }).noteId;
  const namespace = (body as { namespace?: unknown }).namespace;
  if (typeof noteId !== "string" || noteId.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "noteId is required.");
  }
  if (typeof namespace !== "string" || namespace.length === 0) {
    return jsonError(400, "ERR_BAD_REQUEST", "namespace is required.");
  }

  const embed = createOllamaEmbedClient({
    endpoint: OLLAMA_ENDPOINT_URL,
    hostOverride: "127.0.0.1:11434",
  });

  try {
    const summary = await indexNote(
      { noteId, namespace },
      {
        fetchNote: (id) => fetchNote(id),
        embed,
        upsertEmbeddings: (id, ns, rows) => upsertEmbeddings(id, ns, rows),
      },
    );
    // Success path — clear any pending retry so the cron stops
    // touching this note. Best-effort; non-2xx is non-fatal.
    await clearRetry(noteId);
    return new Response(JSON.stringify({ ok: true, data: summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (cause) {
    // BUG-006 hardening: enqueue a retry instead of silently dropping.
    // m10_embedding_retry cron picks the row back up every 15 min and
    // re-fires notes_embed_trigger by touching the note.
    const message = cause instanceof Error ? cause.message : "Embedding failed";
    await enqueueRetry(noteId, namespace, message);
    return jsonError(502, "ERR_UPSTREAM", message);
  }
});

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function fetchNote(noteId: string): Promise<NoteSnapshot | null> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?select=id,title,body_json,is_trashed,ai_excluded&id=eq.${encodeURIComponent(noteId)}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as Array<{
    id: string;
    title: string;
    body_json: unknown;
    is_trashed: boolean;
    ai_excluded: boolean;
  }>;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    title: row.title,
    bodyJson: typeof row.body_json === "string" ? row.body_json : JSON.stringify(row.body_json),
    isTrashed: row.is_trashed,
    aiExcluded: row.ai_excluded,
  };
}

async function upsertEmbeddings(
  noteId: string,
  namespace: string,
  chunks: readonly ChunkRow[],
): Promise<void> {
  // Delete then insert: this keeps the (note_id, namespace) row set
  // in lockstep with the latest chunking. PostgREST doesn't support a
  // true atomic delete+insert in one request, so we accept that a
  // crash mid-call leaves the table in a "deleted but not yet
  // re-inserted" state — the trigger retry-fires and the function is
  // idempotent.
  const deleteResp = await fetch(
    `${SUPABASE_URL}/rest/v1/note_embeddings?note_id=eq.${encodeURIComponent(noteId)}&namespace=eq.${encodeURIComponent(namespace)}`,
    {
      method: "DELETE",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    },
  );
  if (!deleteResp.ok && deleteResp.status !== 404) {
    throw new Error(`upsertEmbeddings DELETE HTTP ${deleteResp.status}`);
  }
  if (chunks.length === 0) return;

  const rows = chunks.map((c) => ({
    note_id: noteId,
    namespace,
    chunk_index: c.chunkIndex,
    content: c.content,
    embedding: c.embedding,
  }));
  const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/note_embeddings`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!insertResp.ok) {
    throw new Error(`upsertEmbeddings INSERT HTTP ${insertResp.status}: ${await insertResp.text()}`);
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * BUG-006 — record an embedding failure so the m10_embedding_retry
 * pg_cron job can pick it up. Best-effort; we don't want the retry
 * book-keeping itself to fail the request and confuse the trigger.
 * Owner is required by the schema; we fetch it from the note row.
 */
async function enqueueRetry(noteId: string, namespace: string, message: string): Promise<void> {
  try {
    const ownerResp = await fetch(
      `${SUPABASE_URL}/rest/v1/notes?select=owner_id&id=eq.${encodeURIComponent(noteId)}`,
      {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      },
    );
    if (!ownerResp.ok) return;
    const [row] = (await ownerResp.json()) as Array<{ owner_id: string }>;
    if (row === undefined) return;
    await fetch(
      `${SUPABASE_URL}/rest/v1/embedding_retries?on_conflict=note_id`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify([
          {
            note_id: noteId,
            owner_id: row.owner_id,
            namespace,
            last_error: message.slice(0, 500),
            next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
        ]),
      },
    );
  } catch {
    // Swallow — bookkeeping failure must not surface to the caller.
  }
}

async function clearRetry(noteId: string): Promise<void> {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/embedding_retries?note_id=eq.${encodeURIComponent(noteId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
      },
    );
  } catch {
    // Same — bookkeeping must not surface.
  }
}

/**
 * Decode a Supabase JWT and return true iff the payload's `role` claim
 * is `service_role`. Signature verification is delegated to the
 * Supabase gateway (this function is deployed *without*
 * `--no-verify-jwt`), so by the time we see the token the gateway has
 * already proven it's project-signed. We only need to inspect the
 * claims to enforce the role restriction.
 */
function isServiceRoleJwt(token: string): boolean {
  if (token.length === 0) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payloadB64 = parts[1] ?? "";
  let payload: unknown;
  try {
    payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return false;
  }
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { role?: unknown }).role === "service_role"
  );
}
