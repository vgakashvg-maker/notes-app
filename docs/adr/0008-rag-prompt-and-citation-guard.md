# ADR 0008 — RAG prompt + citation guard

Date: 2026-05-22
Status: Accepted

## Context

M09 introduces the chat-with-notes pipeline. The single highest-risk
decision in the module is **how the model cites notes and how we
protect users from hallucinated citations**. A free-form citation
contract — "the model decides how to attribute" — produces UUID
hallucinations that look real in the chat surface. We need a
mechanical guard that catches them before they reach the client.

The user approved the design captured here on 2026-05-22.

## Decision

### Citation marker format

The model emits `[[NoteId:<uuid>]]` inline, immediately after the
sentence (or sentence fragment) whose fact came from that note. The
marker shares its bracket shape with M06's `[[note:<uuid>]]`
internal-link node — different prefix (`NoteId:` vs `note:`) so the
parsers don't collide, but the same general look so editors and
renderers can treat them the same way.

Example:

> Your tax appointment is March 14 [[NoteId:abc-123-…]].

Multiple sources in one sentence get multiple markers separated by
spaces.

### Anti-hallucination pipeline

1. **System-prompt rule** forbids inventing UUIDs and instructs the
   model to use only IDs that appear in `<context>`.
2. **Streaming citation guard** (`CitationGuard` in
   `packages/ai/src/rag-pipeline.ts`) parses every completed
   `[[NoteId:xxx]]` token-by-token, maintaining a buffer that survives
   split tokens. Each completed marker is checked against the set of
   UUIDs the retrieval step actually returned.
   - **UUID in set**: marker passes through verbatim into the
     `chunk` SSE stream **and** a parallel `citation` SSE event is
     emitted exactly once per distinct UUID (with title, chunk index,
     rank).
   - **UUID NOT in set**: marker is **stripped from the chunk
     stream** (replaced with empty string) and a `warning` SSE event
     is emitted instead. The client never sees the hallucinated
     marker.
3. **Empty-retrieval short-circuit**: if `vector_search()` returns
   zero hits, we skip the LLM call entirely and return the canned
   "I don't have a note about that yet." — saves a round-trip and
   removes the temptation to hallucinate.
4. **Anti-jailbreak**: user content is wrapped in `<user>` tags;
   retrieved context is wrapped in `<context>` tags; the system
   prompt explicitly tells the model to ignore instruction-override
   attempts that appear inside either.

### Prompt structure

The full text lives at `/prompts/chat.md`. The relevant layering:

```
<system>
  ...rules above...
</system>

<context>
  [Note id=…, title="…"] (chunk N)
  …chunk body…
  …
</context>

<conversation_summary>{archived_summary_or_blank}</conversation_summary>
<recent_turns>{last_N_pairs}</recent_turns>

<user>{user_question}</user>
```

`<context>` is filled by the pipeline from the top-K results of
`vector_search()`. The header carries `id=` and `title=` so the model
has the UUID it needs for citation **and** a human-readable label.

### Knobs (V1 defaults)

| Param | Default | Notes |
|---|---|---|
| `k` retrieved chunks | 6 | Tuned for 8k-token windows |
| `excludeAi` filter | true | Suppress recursive citation of system-generated notes |
| Recent turns kept | last 10 | Older pairs go into `archived_summary` |
| Compression trigger | est. prompt > 70% of model's context | Compression task uses `llama3.2:3b` |
| Routed chat model | `qwen2.5:7b` | Per CLAUDE.md override |

### Streaming protocol (SSE)

The `ai/chat` Edge Function emits four event kinds:

- `event: chunk` — incremental token text (includes literal `[[NoteId:xxx]]`).
- `event: citation` — `{noteId, title, chunkIndex, rank}` — one per distinct cited UUID.
- `event: warning` — `{message}` — for stripped hallucinations.
- `event: done` — `{conversationId, tokens, model, latencyMs}` — terminal.

The UI can render the chunk stream inline (citation pills built from
the literal marker text) and the citation events into a sidebar list.

## Consequences

- Hallucinated UUIDs cannot reach the client — even if the model
  generates 100 of them in a single response. The guard fails closed.
- The model's "answer space" is constrained to the retrieved chunks
  + conversation context. This is the right trade for a notes app: we
  prefer "I don't have a note about that yet." over a confident
  fabrication.
- Future provider swaps (Anthropic, OpenAI) inherit the same guard
  for free — the guard is provider-agnostic. The `default_model` and
  `overrides` fields in each prompt's YAML front-matter handle
  per-provider tuning.

## Alternatives considered

- **Footnote-style `[^abc-123]`**: rejected. M06 already standardised
  the `[[…]]` sigil shape; using a second shape for citations would
  bifurcate the parsing surface.
- **No guard — trust the model**: rejected. Open-weight models
  hallucinate UUIDs frequently in our local tests; we can't ship that
  to a user.
- **Pass hallucinated markers through with a "missing" placeholder
  rendered in the UI**: rejected. The placeholder UX is worse than no
  marker; a hallucinated citation gives the user a false signal of
  attribution that doesn't exist.
- **k = 4 / k = 8 chunks**: 6 is the empirical sweet spot for
  qwen2.5:7b's 32k context with our ~500-token chunks. M15 will make
  this user-configurable.
- **Separate "summarize my notes about X" path**: rejected. The same
  RAG pipeline handles summarize-style queries — the model adapts
  based on the user's intent, and bumping k from 6 to 12 (when the
  user explicitly asks for a summary) is a future enhancement under
  the same code path.

## Validation

- `packages/ai/src/__tests__/citation-guard.test.ts` exercises 6
  branches: valid pass-through, hallucination strip, duplicate
  dedup, split-across-token-boundaries, incomplete marker at
  flush, distinct-marker rank ordering.
- `packages/ai/src/__tests__/rag-pipeline.test.ts` exercises the
  end-to-end pipeline: persistence ordering, empty-retrieval
  short-circuit, scope-filter pushdown, archived-summary inclusion,
  hallucination warning emission.
- Live integration against the actual Ollama on Kepler is deferred
  to M12 / M13 — the natural smoke surface is the chat UI itself.
