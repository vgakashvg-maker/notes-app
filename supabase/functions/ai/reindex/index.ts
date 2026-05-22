// Edge Function: POST /functions/v1/ai/reindex
//
// Re-embeds all of the caller's notes against the active embedding
// namespace. M10's note_embeddings table + notes_embed_trigger handle
// the actual indexing on note INSERT/UPDATE; this function simply
// touches each note to fire the trigger, batch by batch.
//
// V1 contract: synchronous (returns when done). A future job-queue
// abstraction can wrap this for the live-progress UI deferred from M15.

import { jsonError, mustEnv, resolveUserId } from "../_shared/ollama.ts";

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const PAGE_SIZE = 100;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");

  const started = Date.now();
  let processed = 0;
  let offset = 0;
  while (true) {
    const ids = await fetchNoteIds(jwt, offset, PAGE_SIZE);
    if (ids.length === 0) break;
    for (const id of ids) {
      const ok = await touchNote(jwt, id);
      if (ok) processed += 1;
    }
    if (ids.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return new Response(
    JSON.stringify({ ok: true, processed, latencyMs: Date.now() - started }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

async function fetchNoteIds(jwt: string, offset: number, limit: number): Promise<string[]> {
  const url =
    `${mustEnv("SUPABASE_URL")}/rest/v1/notes` +
    `?select=id&is_trashed=eq.false&ai_excluded=eq.false` +
    `&order=updated_at.desc&offset=${offset}&limit=${limit}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
  });
  if (!resp.ok) return [];
  const rows = (await resp.json()) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/**
 * No-op UPDATE that bumps updated_at and fires notes_embed_trigger.
 * The trigger enqueues the embedding job via pg_net (M10); this
 * function doesn't need to wait for indexing to finish — the trigger
 * is fire-and-forget.
 */
async function touchNote(jwt: string, id: string): Promise<boolean> {
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/notes?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    },
  );
  return resp.ok;
}
