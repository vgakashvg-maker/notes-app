# M04 — Notes Core Service

> **Module ID**: `M04`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 5–7 days
> **Depends on**: M01

---

## Purpose

CRUD for notes, notebooks, tags. Pure backend logic — does not know about Drive, Claude, or Calendar. Lives in Supabase (Postgres tables + RLS + a few Edge Functions for compound operations).

---

## Public Interface (the port)

```kotlin
interface NotesService {
  suspend fun createNote(input: NewNoteInput): Note
  suspend fun updateNote(id: NoteId, patch: NotePatch): Note
  suspend fun trashNote(id: NoteId)
  suspend fun restoreNote(id: NoteId)
  suspend fun listNotes(filter: NoteFilter, page: Page): PagedResult<Note>
  suspend fun getNote(id: NoteId): Note
  suspend fun searchKeyword(q: String, filter: NoteFilter): List<NoteHit>

  // Notebooks
  suspend fun createNotebook(name: String, color: String?): Notebook
  suspend fun listNotebooks(): List<Notebook>
  suspend fun renameNotebook(id: NotebookId, name: String): Notebook
  suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?): Unit

  // Tags
  suspend fun createTag(name: String, color: String?): Tag
  suspend fun listTags(): List<Tag>
  suspend fun mergeTag(from: TagId, into: TagId): Unit
}
```

---

## Responsibilities

- Postgres schema for notes, notebooks, tags, note_tags, attachments_refs (see reference/data-model.md).
- Row-Level Security policies enforce `owner_id = auth.uid()` on every table — even in single-user V1.
- Postgres full-text search index (tsvector) on note title + body; updated by trigger.
- Triggers update `updated_at` on every change.
- 30-day trash retention via pg_cron scheduled SQL job.
- All TypeScript SDK code is auto-generated from PostgREST types — do not hand-write CRUD wrappers.

---

## Deliverables

- SQL migration files in `supabase/migrations/` (versioned, idempotent).
- Auto-generated TypeScript types via `supabase gen types typescript`.
- Thin Kotlin client wrapper for Android (uses Supabase Kotlin SDK).
- Edge Function `notes/bulk-update` for atomic multi-note operations (e.g., move N notes to a notebook).
- RLS policy tests using pgTAP or a SQL-based test runner.
- Seed script that inserts ~50 sample notes for development.

---

## Relevant Data Model

- `notes`
- `notebooks`
- `tags`
- `note_tags`
- `attachments_refs`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `GET / POST / PATCH /rest/v1/notes (via PostgREST auto-generated)`
- `GET /rest/v1/notebooks, /rest/v1/tags (PostgREST)`
- `POST /functions/v1/notes/bulk-update`

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
You are implementing module M4 (Notes Core Service) of the Evernote-like notes
app. Read `tech-specs/M04-notes-core.md` and `reference/data-model.md` before
starting.

Prerequisites:
  - A Supabase project is already created.
  - M1 (core-domain) is implemented.
  - M2 (auth) is in progress or done — RLS will use `auth.uid()`.

Your job:
  1. Write SQL migrations in `supabase/migrations/`. One migration per logical
     change. Use the schema in reference/data-model.md exactly. Add:
        - notes, notebooks, tags, note_tags, attachments_refs tables
        - RLS policies: `owner_id = auth.uid()` on every table
        - tsvector column `body_tsv` on notes; trigger to maintain it
        - updated_at trigger on every table
        - Index on owner_id+updated_at, body_tsv (GIN), tags(owner_id, name)
        - pg_cron job for 30-day trash retention
  2. Run `supabase db push` to apply migrations to the project.
  3. Generate TS types: `supabase gen types typescript --local > src/types/db.ts`.
  4. Write the Kotlin client wrapper for Android using supabase-kt.
  5. Implement Edge Function `notes/bulk-update` (TypeScript / Deno).
  6. Write RLS policy tests using pgTAP. Verify: another user's notes are
     unreadable; updates to another user's notes fail.
  7. Write a seed script `scripts/seed.ts` that inserts 50 sample notes.

Tests:
  - RLS tests must pass.
  - At least one happy-path test per public NotesService method.
  - A test that confirms keyword search returns expected notes ranked correctly.

Definition of Done is in the spec. Do not skip the RLS tests — they are the
multi-tenant safety net.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.4
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
