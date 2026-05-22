# @notes-app/embeddings

Chunker + Ollama embed client + the pure-logic backing for the
`embeddings/index` Edge Function and the `vector_search()` SQL function.

## Public surface

- `chunkText(text, opts)` — word-based chunker (~500 / 50 overlap by
  default).
- `plainTextFromProseMirror(bodyJson)` — extracts whitespace-collapsed
  plain text. Mirrors the SQL `extract_plain_from_prosemirror` from the
  M04 migration so FTS and embeddings agree on what "the body" means.
- `DEFAULT_NAMESPACE = "ollama:nomic-embed-text"` and
  `EMBEDDING_DIMENSION = 768`.
- `createOllamaEmbedClient({ endpoint, fetcher?, hostOverride? })` —
  thin wrapper around Ollama's `/api/embed`. The `hostOverride` is the
  Funnel workaround (ADR 0008): when the Edge Function calls Ollama via
  the public Tailscale Funnel URL, Ollama's host-check rejects the
  hostname; passing `Host: 127.0.0.1:11434` makes it accept the request.
- `indexNote(request, deps)` — pure logic for the Edge Function. Skips
  cleanly on trashed / ai_excluded / missing notes, deleting their
  existing embeddings for the namespace.
- `vectorSearch(query, opts, deps)` — embed-then-RPC wrapper around the
  SQL `vector_search()` function.

## Namespaces

`{provider}:{model}`. V1 ships `ollama:nomic-embed-text`. New
namespaces are introduced by M15 (AI Settings); each new namespace
requires a partial HNSW index in a follow-up migration (the M10
migration already wires the V1 one).

## Where the wires meet

- Edge Function entry: `supabase/functions/embeddings/index/index.ts`
  passes a service-role fetch into the same `indexNote()` logic.
- Trigger: the M10 migration defines `notes_embed_trigger` AFTER
  INSERT/UPDATE OF body_json,title,is_trashed,ai_excluded — it calls the
  Edge Function via `pg_net.http_post` with the service-role bearer.
- SQL `vector_search()` is the only retrieval path; the TS wrapper
  composes embed + RPC.

## Testing

```powershell
pnpm --filter @notes-app/embeddings test
```

Live integration (real Ollama + Supabase + the trigger end-to-end) is
deferred until M09 chat / M15 routing land — once the chat surface
exists, "search for the note about X" is the natural smoke test.
