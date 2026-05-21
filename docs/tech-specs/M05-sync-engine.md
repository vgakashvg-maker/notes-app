# M05 — Sync Engine (Android)

> **Module ID**: `M05`
> **Complexity / Recommended AI dev**: Opus
> **Estimated duration**: 7–10 days
> **Depends on**: M01, M04

---

## Purpose

Offline-first sync between Android Room cache and the Supabase backend. Handles queuing of offline writes, conflict detection, and realtime push. THIS IS THE HARDEST MODULE — concurrency, idempotency, and conflict policy all matter.

---

## Public Interface (the port)

```kotlin
interface SyncEngine {
  fun start(scope: CoroutineScope)
  fun syncStatus(): StateFlow<SyncStatus>
  suspend fun forcePull()
  suspend fun forcePush()
}

sealed class SyncStatus {
  object Idle: SyncStatus()
  data class Syncing(val direction: Direction, val itemsRemaining: Int): SyncStatus()
  data class Error(val message: String, val canRetry: Boolean): SyncStatus()
  data class Conflict(val noteId: NoteId): SyncStatus()
}
```

---

## Responsibilities

- Outbox table in Room for pending writes; periodic flush via WorkManager.
- Pull strategy: server `updated_at > last_sync_at` per table, paged.
- Push strategy: outbox row → REST call → on success, remove from outbox.
- Conflict policy: last-writer-wins on body; union on tags; flag conflicts in a system note.
- Subscribe to Supabase Realtime channel for the user's row updates while app is foregrounded.
- Idempotency: every write carries a client-generated UUID; server rejects duplicates.
- Resume-safe: kill the app mid-sync, restart, no data loss, no duplicates.
- Battery-aware: WorkManager constraints (connected, not low-battery) for non-urgent flushes.

---

## Deliverables

- Kotlin library `sync-android` (clean Coroutines, no Android-specific deps in the core).
- Room schema mirroring the server schema (notes, notebooks, tags, note_tags, sync_outbox).
- WorkManager workers: PushWorker, PullWorker.
- Realtime subscriber that auto-merges incoming rows.
- Conflict-handling: on conflict, raw remote body is preserved in a system note named 'Conflicts'.
- Documentation: `docs/how-sync-works.md` explainer (state machine, conflict policy, idempotency).
- Tests: unit tests for outbox flush, conflict detection, realtime merging. One end-to-end test that uses two Android emulator instances editing the same note offline.

---

## Relevant Data Model

- `(Android local) sync_outbox`
- `(Android local) notes, notebooks, tags, note_tags (Room mirror)`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `PATCH /rest/v1/notes (idempotency-key header)`
- `POST /rest/v1/notes (idempotency-key header)`

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
You are implementing module M5 (Sync Engine — Android) of the Evernote-like
notes app. Read `tech-specs/M05-sync-engine.md` before starting. **This is the
hardest module in the system. Do not cut corners on correctness.**

Prerequisites:
  - M1 (core-domain), M4 (notes-core with REST endpoints + Realtime), are done.
  - Supabase Realtime is enabled for tables: notes, notebooks, tags, note_tags.

Your job:
  1. Set up Room schema mirroring the server tables. Add `sync_outbox` table
     for pending writes (op = INSERT/UPDATE/TRASH; payload jsonb; attempts;
     created_at).
  2. Implement `SyncEngine` with three coroutine loops launched by `start`:
       - Outbox flusher (every 30s or on connectivity regained)
       - Periodic puller (every 5 min when foregrounded)
       - Realtime listener (subscribes when app foreground, unsubscribes
         on background)
  3. Every client-side mutation:
       a) Writes to Room IMMEDIATELY (UI never blocks on network)
       b) Inserts a row in sync_outbox with a client-generated UUID
       c) Outbox flusher picks it up; on success removes it; on 409
          (already-applied via idempotency key) treats as success.
  4. Pull: SELECT * FROM <table> WHERE owner_id = me AND updated_at > last_sync_at
     ORDER BY updated_at ASC LIMIT 500; update last_sync_at to max(updated_at)
     of returned page; loop until page < 500.
  5. Conflict detection: if a pulled row's updated_at > local row's updated_at
     AND the local row has an outbox entry for it, that's a conflict. Policy:
       - body: keep remote, store local body in a system note titled
         "[Conflict] <original title>" inside a special "Conflicts" notebook
       - tags: union of remote and local
       - is_pinned/is_trashed: prefer remote (server is source of truth for
         non-content fields)
  6. WorkManager constraints: PushWorker requires CONNECTED;
     PullWorker requires UNMETERED for full pull, CONNECTED for incremental.
  7. Tests are MANDATORY:
       - Outbox flush with intermittent network failures (use a fake
         transport).
       - Conflict creation with two simulated clients.
       - Process-death recovery: kill mid-flush, verify no duplicates after
         restart.

Write a clear `docs/how-sync-works.md` with the state machine diagram and the
conflict-policy decision tree. Future maintainers will thank you.

Definition of Done is in the spec. Test rigorously; sync bugs eat user trust.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.5
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
