# Data Model Reference

> Postgres schema for the Evernote-like notes app. All tables include
> `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references
> auth.users(id)`, `created_at`, `updated_at`. **Row-Level Security enforces
> `owner_id = auth.uid()` on every table from day one** — this is what makes
> multi-tenant trivial later.

## Table catalog

| Table | Key columns | Notes |
|---|---|---|
| `users_profile` | user_id pk → auth.users, storage_provider, calendar_provider, ai_prefs jsonb | 1 row per user; per-user provider choices. |
| `notebooks` | id, owner_id, name, color, sort_order | One level deep. |
| `tags` | id, owner_id, name, color | Unique on (owner_id, lower(name)). |
| `notes` | id, owner_id, notebook_id, title, body_json jsonb, body_tsv tsvector, is_pinned, is_trashed, trashed_at, ai_excluded boolean default false | tsvector maintained by trigger for keyword search. |
| `note_tags` | note_id, tag_id (composite pk) | Join table. |
| `attachments_refs` | id, owner_id, note_id, provider, external_id, display_name, mime, size_bytes, thumbnail_id | References Drive/OneDrive; never bytes. |
| `events_mirror` | id, owner_id, external_event_id, calendar_id, title, start_at, end_at, payload jsonb | Read-only mirror of Google Calendar. |
| `note_event_links` | note_id, external_event_id | Tracks events created from a note. |
| `note_embeddings` | id, owner_id, note_id, chunk_index, content text, embedding vector, namespace text | HNSW index per namespace. |
| `ai_conversations` | id, owner_id, title, model_hint, created_at, last_message_at, archived_summary text | Persistent chat threads. |
| `ai_messages` | id, conversation_id, role, content, citations jsonb, provider, model, prompt_tokens, completion_tokens, cost_usd, created_at | One row per turn. |
| `ai_memory` | id, owner_id, fact text, source ('user' \| 'derived'), confidence, created_at, last_used_at | Long-term facts. |
| `ai_keys` | owner_id, provider, encrypted_secret bytea, endpoint_url text | Encrypted; V1 only stores endpoint_url. |
| `ai_usage_log` | id, owner_id, provider, model, task, prompt_tokens, completion_tokens, cost_usd, latency_ms, at | Powers usage dashboard. |
| `reminders` | id, owner_id, note_id, fire_at, payload jsonb, status | Local + (future) push. |
| `sync_outbox` (Android local only) | id, op, payload jsonb, attempts, created_at | Room table; never synced to backend. |
| `audit_log` | id, owner_id, actor, action, target, at, meta jsonb | Append-only. |

## RLS policy template (apply to every table)

```sql
CREATE POLICY "owner_can_all" ON <table>
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

Public launch requires zero schema changes; only feature flags.

## Required extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;       -- for note_embeddings
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- for trash retention, briefing job
CREATE EXTENSION IF NOT EXISTS pg_net;       -- for trigger-driven Edge Function calls
```

## Triggers to implement

1. **`notes_tsv_trigger`** — UPDATE body_tsv = to_tsvector(title || ' ' || extract_plain(body_json)) on INSERT/UPDATE.
2. **`updated_at_trigger`** — UPDATE updated_at = now() on every row change. Apply to all tables.
3. **`notes_embed_trigger`** — AFTER INSERT/UPDATE OF body_json, call pg_net.http_post to embeddings/index Edge Function.

## Scheduled jobs (pg_cron)

| Job | Schedule | What |
|---|---|---|
| `trash_retention` | `0 3 * * *` (daily 3am UTC) | DELETE FROM notes WHERE is_trashed AND trashed_at < now() - interval '30 days'. |
| `daily_briefing` | configurable per user | Calls ai/briefing Edge Function for each user at their chosen hour. |
| `attachment_validate` | `0 4 * * *` | Calls attachments/validate to check for dangling references. |
