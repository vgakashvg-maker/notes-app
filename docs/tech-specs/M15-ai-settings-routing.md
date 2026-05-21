# M15 — AI Settings, Routing & Endpoint Management

> **Module ID**: `M15`
> **Complexity / Recommended AI dev**: Opus (design) + Sonnet (UI) + Haiku (test-connection func)
> **Estimated duration**: 5–7 days
> **Depends on**: M01, M02, M09

---

## Purpose

User-facing control plane for the second brain. V1 lets the user configure the Ollama endpoint URL, pick which model handles which task, test the connection, and see latency/usage telemetry. The routing schema is multi-provider-aware so V2's added providers slot in without redesign.

---

## Public Interface (the port)

```kotlin
interface AIRouting {
  suspend fun providersAvailable(): List<ProviderId>
  suspend fun getRouting(): RoutingConfig
  suspend fun setRouting(config: RoutingConfig)
  suspend fun resolveFor(task: AITask): AdapterBinding
}

data class RoutingConfig(
  val chat:       AdapterBinding,
  val summarize:  AdapterBinding,
  val tagging:    AdapterBinding,
  val titling:    AdapterBinding,
  val embeddings: AdapterBinding,
  val briefing:   AdapterBinding,
  val rewrite:    AdapterBinding,
)
data class AdapterBinding(val provider: ProviderId, val model: String)

// V2: when Claude/OpenAI added, add API-key management:
interface AIKeyStore {
  suspend fun putKey(provider: ProviderId, secret: String)
  suspend fun hasKey(provider: ProviderId): Boolean
  suspend fun deleteKey(provider: ProviderId)
  suspend fun ollamaEndpoint(): String?
  suspend fun setOllamaEndpoint(url: String)
}
```

---

## Responsibilities

- Settings → AI screens on Android (Compose) and Web (Next.js): three sections — Endpoint, Routing, Usage.
- Endpoint section: single 'Ollama endpoint URL' input; 'Test connection' button that calls Ollama /api/tags and shows installed models.
- Routing section: table of tasks × Model dropdown; dropdown options populated from /api/tags response.
- Usage section: line chart of latency over time; bar chart of token counts per task per day.
- Endpoint URL stored in `users_profile.ai_prefs` jsonb.
- ai_keys table is built (encrypted via Supabase Vault) but unused in V1; V2 lights it up.
- Re-embed background job triggered when user changes the embedding model.

---

## Deliverables

- Android Settings → AI screens (Compose).
- Web Settings → AI pages.
- Edge Function `ai/test-connection` (calls Ollama /api/tags).
- Edge Function `ai/usage` for the usage dashboard.
- DB migration: ai_keys, ai_usage_log, expand users_profile.ai_prefs.
- Re-embed background job.

---

## Relevant Data Model

- `users_profile`
- `ai_keys`
- `ai_usage_log`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/ai/test-connection`
- `GET /functions/v1/ai/usage`

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
You are implementing module M15 (AI Settings, Routing & Endpoint Management) of
the Evernote-like notes app. Read `tech-specs/M15-ai-settings-routing.md` and
`reference/ollama-setup.md` before starting.

Prerequisites:
  - M1, M2 done.
  - M9 (ai-services) is in progress or done — you need the AIProvider port
    type to reference, even if only OllamaAdapter exists.

Your job:
  1. SQL migration:
       ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS ai_prefs jsonb
         DEFAULT '{}'::jsonb;
       CREATE TABLE ai_keys (
         owner_id uuid primary key references auth.users(id),
         provider text not null,
         encrypted_secret bytea,
         endpoint_url text
       ) ENABLE ROW LEVEL SECURITY; -- policy: owner_id = auth.uid()
       CREATE TABLE ai_usage_log (
         id uuid primary key default gen_random_uuid(),
         owner_id uuid not null,
         provider text not null, model text not null, task text not null,
         prompt_tokens int, completion_tokens int, cost_usd numeric,
         latency_ms int, at timestamptz default now()
       );

  2. Edge Function `ai/test-connection`:
       Input: { endpoint_url }
       Steps: fetch `${endpoint_url}/api/tags`; on success return
       { ok: true, models: [...] }; on failure return { ok: false, error }.

  3. Edge Function `ai/usage`:
       Returns aggregated stats for the user from ai_usage_log (per-day per-task).

  4. Routing config:
       Stored as `users_profile.ai_prefs.routing` jsonb. Shape =
       { chat: {provider, model}, summarize: {...}, ... }.
       Defaults seeded on first sign-in:
         chat       → { ollama, llama3.1:8b }
         summarize  → { ollama, llama3.1:8b }
         tagging    → { ollama, llama3.2:3b }
         titling    → { ollama, llama3.2:3b }
         embeddings → { ollama, nomic-embed-text }
         briefing   → { ollama, llama3.1:8b }
         rewrite    → { ollama, llama3.1:8b }

  5. Android Settings UI (Compose):
       - Endpoint screen: TextField for URL, 'Test connection' button.
       - Routing screen: a list of (task, model dropdown) rows. Dropdown
         is populated from /api/tags. Save button persists to ai_prefs.
       - Usage screen: simple charts using Vico or AndroidX Compose Canvas.

  6. Web Settings UI (Next.js):
       - Same three sections as Android; same logic; shadcn/ui components.

  7. Re-embed job:
       - On routing.embeddings change, kick off a background job that
         iterates all notes and re-calls M10's embedding/index Edge Function
         with the new namespace. Show progress in UI.

Tests:
  - Endpoint test-connection: live test against a real Ollama instance.
  - Routing save + reload: persists correctly.
  - Re-embed trigger: changing embedding model enqueues the right number of
    jobs.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.15
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
