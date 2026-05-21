# M09 — Second-Brain AI Services (Ollama V1)

> **Module ID**: `M09`
> **Complexity / Recommended AI dev**: Opus
> **Estimated duration**: 10–14 days
> **Depends on**: M01, M04, M10, M15

---

## Purpose

The heart of the product. All AI capabilities — summarization, tagging, Q&A, chat-with-notes, daily briefing, connection discovery — sit behind a provider-agnostic AIServices facade. V1 ships only the OllamaAdapter; the port architecture allows V2 to add Claude/OpenAI as one-file additions.

---

## Public Interface (the port)

```kotlin
// Provider-agnostic port — V1 has one impl (OllamaAdapter)
interface AIProvider {
  val id: ProviderId                            // OLLAMA | (V2: CLAUDE, OPENAI, ...)
  val capabilities: Set<Capability>             // STREAMING, EMBEDDINGS, VISION, TOOL_USE
  suspend fun listModels(): List<ModelDescriptor>
  suspend fun chat(messages: List<Message>, opts: AIOptions): AIResponse
  fun streamChat(messages: List<Message>, opts: AIOptions): Flow<AIChunk>
  suspend fun embed(texts: List<String>, model: String): List<FloatArray>?
  suspend fun ping(): ProviderHealth
}

// Domain-facing facade — UI talks only to this
interface AIServices {
  // Per-note (one-shot)
  suspend fun summarize(noteId: NoteId, length: SummaryLength): String
  suspend fun suggestTags(noteId: NoteId): List<String>
  suspend fun suggestTitle(noteId: NoteId): String
  suspend fun extractActionItems(noteId: NoteId): List<String>
  suspend fun rewrite(text: String, instruction: String): String

  // Corpus-wide (the second-brain features)
  fun chat(conversationId: ConversationId?, message: String, scope: NoteScope): Flow<ChatChunk>
  suspend fun relatedNotes(noteId: NoteId, k: Int = 10): List<RelatedNote>
  suspend fun dailyBriefing(date: LocalDate): Briefing

  // Conversation persistence
  suspend fun listConversations(): List<Conversation>
  suspend fun getConversation(id: ConversationId): Conversation
  suspend fun newConversation(seed: String? = null): ConversationId
  suspend fun deleteConversation(id: ConversationId)
}
```

---

## Responsibilities

- OllamaAdapter calls the user's Ollama endpoint (Tailscale Funnel URL from M15).
- Streaming via Ollama's NDJSON response format; UI gets a Flow of chunks.
- Model selection per task is resolved via M15 routing config.
- RAG pipeline for chat: vector retrieval (M10) → top-k chunks → prompt assembly → stream answer with [[NoteId:xxx]] citations.
- Persistent conversations stored in Postgres (ai_conversations, ai_messages); UI shows a history sidebar.
- Conversation compression: when context > 70% of model's window, summarize older turns with the same routed model.
- Daily briefing: pg_cron job runs at user's configured time; reads yesterday's notes + today's calendar + open action items; produces Markdown briefing.
- Connection discovery (related notes): pure vector similarity, no LLM call, sub-100ms.
- All AI calls go through backend Edge Functions which proxy to Ollama via Tailscale. Legion never directly exposed.
- Prompt library in `/prompts/*.md` — versioned, neutral templates, per-model overrides ready for V2.
- Cost telemetry logged to `ai_usage_log` (in V1 this records latency + tokens but $0 cost).

---

## Deliverables

- Edge Functions: `ai/chat` (SSE streaming), `ai/summarize`, `ai/suggest-tags`, `ai/suggest-title`, `ai/related`, `ai/briefing`, `ai/rewrite`.
- OllamaAdapter implementation (TS for Edge, Kotlin reference for direct LAN mode).
- Prompt library `/prompts/*.md`.
- Conversation persistence: schema migration + Edge Functions for list/get/delete.
- Chat UI components (Android + Web) with streaming render.
- Integration tests against a real Ollama instance.

---

## Relevant Data Model

- `ai_conversations`
- `ai_messages`
- `ai_memory`
- `ai_usage_log`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/ai/chat (SSE)`
- `POST /functions/v1/ai/summarize`
- `POST /functions/v1/ai/suggest-tags`
- `POST /functions/v1/ai/suggest-title`
- `POST /functions/v1/ai/related`
- `POST /functions/v1/ai/briefing`
- `POST /functions/v1/ai/rewrite`

(Full API contract: `reference/api-contract.md`)

---

## Definition of Done

Apply the checklist in `reference/definition-of-done.md` in full. The
module-specific extras are:

- All items in **Deliverables** above are produced and reviewed.
- All items in **Responsibilities** above are demonstrably true (point at the
  code that proves each one).
- The module-specific tests listed in the **Ready-to-Use Prompt** below pass
  in CI.

---

## Ready-to-Use Prompt (paste this into Claude Code / Cursor)

```
You are implementing module M9 (Second-Brain AI Services — Ollama V1) of the
Evernote-like notes app. Read `tech-specs/M09-ai-services.md`,
`reference/ollama-setup.md`, and `tech-specs/M15-ai-settings-routing.md` before
starting. This is the highest-judgment module in the system.

Prerequisites:
  - M1 (core-domain) is done.
  - M4 (notes-core) is done.
  - M10 (embedding-vector) is done; `vector_search(embedding, k, filter)` works.
  - M15 (ai-settings-routing) is done OR provides a stub that returns hard-coded
    routing (chat → llama3.1:8b, tag → llama3.2:3b, embed → nomic-embed-text).
  - The human has Ollama running on the Legion reachable via Tailscale Funnel
    at some URL — they will provide it.

Your job:
  1. Implement `AIProvider` interface in core-domain (TS + Kotlin shapes).
  2. Implement `OllamaAdapter` in TS for Edge Functions:
       - Uses fetch() against the Ollama endpoint
       - Supports /api/chat (streaming via NDJSON), /api/embed, /api/tags,
         /api/generate
       - On 5xx/network error, single retry with 1s backoff, then surface
         actionable error
  3. Implement `AIServices` facade. Each method resolves the routed model via
     M15 then calls OllamaAdapter.
  4. RAG pipeline for `chat`:
       - Embed the user's question (route: embed task)
       - Call M10 vector_search(embedding, k=6, filter by scope)
       - Build prompt with system instructions + retrieved chunks + prior
         conversation turns
       - Stream the answer; on token chunks containing [[NoteId:UUID]],
         pass through to the client as-is
       - Persist user message + assistant message in ai_messages with token
         counts and cost ($0 in V1).
  5. Conversation memory:
       - When `getConversation` is called, return last N messages plus
         conversation.archived_summary if present.
       - Before each chat call, estimate token count; if > 70% of model's
         window, summarize older turns into archived_summary using the same
         routed model (a cheap call to llama3.2:3b for the summarization).
  6. Daily briefing:
       - pg_cron job at user's `users_profile.ai_prefs.briefing_hour`
         (default 8am in user's timezone)
       - Reads notes WHERE updated_at::date = yesterday
       - Reads events_mirror WHERE start_at::date = today
       - Reads notes WHERE has_open_actions = true (you'll need to compute this)
       - Calls `ai/briefing` with structured input; returns Markdown
       - Stores as a system note pinned to today's view
  7. Related notes:
       - `ai/related` takes a noteId; fetches the note's first embedding chunk;
         calls vector_search(k=10, filter: not the same note); returns the hits.
       - No LLM call. Sub-100ms target.
  8. Prompt library `/prompts/*.md` — each file is one task; supports a
     model-override block (commented YAML front-matter) for V2 when multiple
     providers exist.

Tests:
  - Unit test the OllamaAdapter with a mocked fetch.
  - Integration test against a live Ollama instance (use a test Tailscale
    setup; document the env vars needed).
  - Round-trip test: persist a conversation, retrieve it, continue chatting,
    verify history is preserved.

Open-weight prompting note: llama3.1:8b is more sensitive to prompt structure
than Claude. Use explicit role tags, bullet-pointed instructions, and few-shot
examples in /prompts/. When in doubt, test both default and reasoning-style
prompts and keep what works.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.9
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
