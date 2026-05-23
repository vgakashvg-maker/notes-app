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

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const OLLAMA_ENDPOINT_URL = mustEnv("OLLAMA_ENDPOINT_URL");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
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
    return new Response(JSON.stringify({ ok: true, data: summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (cause) {
    return jsonError(
      502,
      "ERR_UPSTREAM",
      cause instanceof Error ? cause.message : "Embedding failed",
    );
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
