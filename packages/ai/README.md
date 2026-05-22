# @notes-app/ai

The second-brain AI module. Provider-agnostic `AIProvider` port + V1
`OllamaProviderAdapter`, a streaming RAG pipeline with a citation
guard, the per-task one-shot functions, and a hard-coded V1 routing
map that M15 will replace.

## Public surface

- **Routing**: `V1_ROUTES`, `staticRouter`. Default chat model:
  `qwen2.5:7b`. Tagging / title / compression: `llama3.2:3b`. Embed:
  `nomic-embed-text`. The router exposes `routeFor(task)`.
- **OllamaProviderAdapter**: implements `AIProvider`. Calls
  `/api/chat`, `/api/embed`, `/api/tags`. One-shot retry on transient
  (5xx / network) errors. Honours the `Host: 127.0.0.1:11434`
  workaround for the Tailscale Funnel + Ollama host-check (see ADR
  0008 — same pattern as M10).
- **RagPipeline**: the chat brain.
  1. Persist the user turn.
  2. Embed the query (via `OllamaEmbedClient` from M10).
  3. `vector_search()` with the scope filters.
  4. **Empty-retrieval short-circuit**: if zero hits, return the
     canned "I don't have a note about that yet." without an LLM
     round-trip.
  5. Compose the system prompt (chat prompt + retrieved context +
     archived summary).
  6. Stream the answer through the **citation guard**:
     - `[[NoteId:<uuid>]]` whose UUID is in the retrieved set →
       passes through verbatim **and** emits a structured
       `citation` chunk.
     - `[[NoteId:<uuid>]]` whose UUID is NOT in the retrieved set →
       **stripped from the stream**, and a `warning` chunk is
       emitted so the UI can log it. The model can hallucinate
       UUIDs all it wants; the client will never see one.
  7. Persist the assistant turn + emit a `done` chunk with token
     metrics + latency.
- **CitationGuard**: streaming parser exposed so other paths (Edge
  Function manual SSE bridge) can reuse it. Handles markers split
  across token boundaries.
- **Per-task functions** (`tasks.ts`): `summarize`, `suggestTags`,
  `suggestTitle`, `extractActionItems`, `rewrite`, `compressTurns`,
  `briefing`. Each takes a `PromptSource` (parsed via
  `parsePrompt`) and a `TaskDeps` ({ provider, router? }).
- **Prompts**: versioned Markdown files at `/prompts/*.md` with YAML
  front-matter declaring task, version, default model, and a map of
  per-provider:model overrides. The loader returns sections (`system`,
  `fewshot`, …) and `composeSystemBlock(p, includeFewshot)` stitches
  them.

## Tests

```powershell
pnpm --filter @notes-app/ai test
```

- `routing.test.ts` — pins the V1 model choices.
- `prompts.test.ts` — front-matter + section parsing.
- `ollama-adapter.test.ts` — chat / stream / embed / retry / 4xx-no-retry.
- `citation-guard.test.ts` — valid + hallucinated + duplicate + split-across-boundaries + incomplete-marker.
- `rag-pipeline.test.ts` — persistence ordering, empty-retrieval short-circuit, scope-filter pushdown, archived-summary usage, hallucination handling end to end.
- `tasks.test.ts` — JSON parsing fallbacks (comma-separated, code-fence-stripped), instruction threading, briefing formatting.

Live integration against the real Ollama on Kepler is deferred to
the natural smoke surface (M12 / M13 chat UI). The Edge Functions
in `supabase/functions/ai/*` are the deployable path; until M15
lands routing, they read the static V1 map directly.

## Citation contract (ADR 0008)

`[[NoteId:<uuid>]]` inline. Same sigil shape as the M06 internal-link
schema's `[[note:<uuid>]]` — different prefix, same parser. The
client can render citation pills inline (from the `delta` stream)
*and* compile a sidebar (from the parallel `citation` events).
