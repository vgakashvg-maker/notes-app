// Edge Function: POST /functions/v1/ai/related
//
// Body: { noteId: uuid, k?: number }
//
// Pure vector retrieval — no LLM call. Target latency < 100ms.

// deno-lint-ignore-file no-explicit-any

import { DEFAULT_NAMESPACE } from "../../../../packages/embeddings/src/index.ts";
import { jsonError, mustEnv, resolveUserId } from "../_shared/ollama.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError(405, "ERR_METHOD_NOT_ALLOWED", "POST only");
  const jwt = req.headers.get("Authorization")?.slice("bearer ".length).trim() ?? "";
  const userId = await resolveUserId(req);
  if (jwt === "" || userId === null) return jsonError(401, "ERR_UNAUTHENTICATED", "Missing JWT");
  let body: any;
  try { body = await req.json(); } catch { return jsonError(400, "ERR_BAD_REQUEST", "Body must be JSON"); }
  const noteId = String(body?.noteId ?? "");
  const k = Number.isInteger(body?.k) ? Number(body.k) : 10;
  if (noteId.length === 0) return jsonError(400, "ERR_BAD_REQUEST", "noteId required");
  if (k <= 0 || k > 50) return jsonError(400, "ERR_BAD_REQUEST", "k must be in (0, 50]");

  // Step 1: fetch the note's first chunk embedding.
  const SUPABASE_URL = mustEnv("SUPABASE_URL");
  const apikey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const auth = `Bearer ${jwt}`;
  const embResp = await fetch(
    `${SUPABASE_URL}/rest/v1/note_embeddings?select=embedding&note_id=eq.${encodeURIComponent(noteId)}&namespace=eq.${encodeURIComponent(DEFAULT_NAMESPACE)}&chunk_index=eq.0`,
    { headers: { Authorization: auth, apikey } },
  );
  if (!embResp.ok) return jsonError(502, "ERR_UPSTREAM", "Could not load source embedding");
  const embRows = (await embResp.json()) as Array<{ embedding: number[] | string }>;
  const row = embRows[0];
  if (row === undefined) {
    return new Response(JSON.stringify({ ok: true, data: { related: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sourceEmbedding = parseEmbedding(row.embedding);
  if (sourceEmbedding === null) return jsonError(502, "ERR_UPSTREAM", "Bad embedding row");

  // Step 2: vector_search with k+1 to leave room for filtering out the source note.
  const searchResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vector_search`, {
    method: "POST",
    headers: { Authorization: auth, apikey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query_embedding: sourceEmbedding,
      k: k + 1,
      filter_namespace: DEFAULT_NAMESPACE,
      filter_notebooks: null,
      filter_tags: null,
      exclude_ai: true,
    }),
  });
  if (!searchResp.ok) return jsonError(502, "ERR_UPSTREAM", "vector_search failed");
  const hits = (await searchResp.json()) as Array<{
    note_id: string;
    chunk_index: number;
    content: string;
    distance: number;
  }>;
  const filtered = hits.filter((h) => h.note_id !== noteId).slice(0, k);

  // Step 3: hydrate titles.
  const ids = Array.from(new Set(filtered.map((h) => h.note_id)));
  const titles = ids.length === 0 ? {} : await fetchTitles(jwt, ids);

  const related = filtered.map((h) => ({
    noteId: h.note_id,
    title: titles[h.note_id] ?? "(untitled)",
    snippet: h.content.slice(0, 240),
    distance: h.distance,
  }));
  return new Response(JSON.stringify({ ok: true, data: { related } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== "string") return null;
  // pgvector serialises as `[0.12, 0.34, ...]`.
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

async function fetchTitles(jwt: string, ids: readonly string[]): Promise<Record<string, string>> {
  const inClause = `in.(${ids.map((id) => `"${id}"`).join(",")})`;
  const resp = await fetch(
    `${mustEnv("SUPABASE_URL")}/rest/v1/notes?select=id,title&id=${inClause}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
    },
  );
  if (!resp.ok) return {};
  const rows = (await resp.json()) as Array<{ id: string; title: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.title;
  return out;
}
