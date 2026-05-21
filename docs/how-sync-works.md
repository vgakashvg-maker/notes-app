# How sync works

The Android client is offline-first. Every user mutation lands in the
local Room cache **immediately** and is enqueued for the server **never
blocking the UI**. The sync engine has three loops that run in parallel:

1. **Outbox flusher** — drains pending writes upward.
2. **Incremental puller** — pulls newer-than-watermark rows downward.
3. **Realtime merger** — applies foreground-only Supabase Realtime events.

All three share one conflict resolver, so they cannot disagree about what
"the latest" means for any given note.

---

## Mutation lifecycle

```
              ┌─────────────────────────────────────────────────────────┐
              │                       UI thread                         │
              └─────────────────────────────────────────────────────────┘
                                  │
                  ▼ (1) write to Room    ▼ (2) enqueue OutboxOp
              ┌──────────────────┐    ┌──────────────────────┐
              │ notes (Room)     │    │ sync_outbox (Room)   │
              └──────────────────┘    └──────────────────────┘
                                            │
                                            ▼  (3) flusher picks oldest PENDING
                                  ┌─────────────────────┐
                                  │   OutboxFlusher     │
                                  └─────────────────────┘
                                            │
                            ┌───────────────┼───────────────┐
                            ▼               ▼               ▼
                       2xx / 409         5xx / net        4xx other
                       (Applied)      (TransientFailure) (PermanentFailure)
                       remove row       requeue PENDING   park FAILED_PERMANENT
                                       + bump attempts    + last_error
```

The UI never reads the outbox. Any subsequent edit to the same note adds
another OutboxOp — the FIFO order guarantees the server sees the user's
intent in order.

### Outbox row state machine

```
PENDING ─(flush attempt)→ IN_FLIGHT ──┬─ Applied            → ✗ removed
                                       ├─ TransientFailure   → PENDING (attempts +1)
                                       └─ PermanentFailure   → FAILED_PERMANENT
                                                                  (kept; surfaced
                                                                   in Settings →
                                                                   Sync errors)

(any IN_FLIGHT older than 60s at startup)
   → reverted to PENDING by reviveStaleInFlight() on engine start
```

Backoff windows (per row, by attempts count): 30s → 2m → 8m → 30m → 2h →
6h, then capped at 6h.

### Idempotency without a server column

We do not store an idempotency key. Instead:

- **INSERT**: the client generates the row's `id` UUID locally before
  enqueueing. A retried INSERT hits the primary-key unique constraint
  and PostgREST returns **409**, which the flusher maps to `Applied`.
- **UPDATE / SetTrashed**: idempotent by construction — applying the
  same patch twice yields the same end state.
- **AddTag / RemoveTag**: the underlying `note_tags` primary key
  `(note_id, tag_id)` makes duplicate inserts and absent deletes
  observably no-ops.

This means we get at-least-once delivery with effectively-once observed
behavior, without any new schema.

---

## Pull lifecycle

```
local.getPullWatermark() ──► remote.pullNotesSince(owner, watermark, 500)
                                       │
                                       ▼
                            (for each remote note)
                            ┌─────────────────────┐
                            │  ConflictResolver   │  ← also used by realtime
                            └─────────────────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                       NoOp        AcceptRemote   Conflict
                       (drop)      (upsert local) (upsert merged
                                                   + insert conflict
                                                     copy in Conflicts
                                                     notebook)
                                       │
                            (after each page) advance watermark to
                                       max(remote.updated_at, watermark)
                                       │
                            (page.size < 500) ⇒ done; otherwise loop
```

The watermark is monotonic and durable. Crashing mid-pull is safe — the
next run resumes from the last persisted watermark and the resolver
re-checks every row.

---

## Conflict policy

A pulled (or realtime-delivered) row is a **conflict** iff:

```
remote.updated_at > local.updated_at
                AND
local row has at least one PENDING / IN_FLIGHT outbox entry
```

When that holds, the resolver returns `Resolution.Conflict(merged,
conflictCopy)`:

| Field             | Resolution      | Why                                                |
|-------------------|-----------------|----------------------------------------------------|
| `body_json`       | **remote wins** | Last-writer-wins for content                       |
| `title`           | **remote wins** | Treated as non-content for V1                      |
| `notebook_id`     | **remote wins** | Move-to-notebook conflicts are rare; remote is canonical |
| `tags`            | **union**       | Tag merges are commutative; no data lost           |
| `is_pinned`       | **remote wins** | Server is source of truth for UI prefs             |
| `is_trashed`      | **remote wins** | Same                                               |
| `ai_excluded`     | **remote wins** | User preference; rarely contested                  |

The pre-conflict local body is **not lost**. The resolver also emits a
`conflictCopy`:

- A new note with id `newConflictId()`
- Title prefixed `"[Conflict] <local title>"`
- Body = the local body verbatim
- Placed in the auto-created `Conflicts` notebook
- `is_pinned = false`, `is_trashed = false` (so the user actually sees
  it)

The user can promote the conflict copy back into the main note manually
if they prefer the local version.

### Conflict-policy decision tree

```
                local == null ?
                       │
              yes ◄────┴────► no
               │               │
       AcceptRemote     remote.updated_at ≤ local.updated_at ?
                               │
                       yes ◄───┴───► no
                        │             │
                       NoOp     hasPending ?
                                      │
                              no ◄────┴────► yes
                               │              │
                       AcceptRemote   Conflict(merged + conflictCopy)
```

Every realtime event and every pulled row traverses this tree exactly
once. Tests in
`packages/android/sync-core/src/test/kotlin/app/notes/sync/ConflictResolverTest.kt`
exercise all five paths.

---

## Realtime channel

Subscribed only while the app is foregrounded (`SyncEngine.setForegrounded(true)`).
Each delivered event goes through the same resolver as the puller so the
two cannot drift. Inserts and updates upsert; deletes remove. There is no
notion of "skipping" realtime events — even if the puller would catch up
later, applying them immediately keeps the UI fresh.

When the app backgrounds, the subscription is torn down; the next
foreground re-subscribes and an incremental pull catches anything missed.

---

## What is NOT in sync-core (yet)

Everything Android-specific lives in M12 once the app shell exists:

- Room schema + DAOs (the M04 SQL schema is the contract).
- WorkManager `PushWorker` (CONNECTED) and `PullWorker` (UNMETERED for
  full pull, CONNECTED for incremental).
- The Supabase Realtime client behind `RealtimeChannel`.
- Foregrounding/backgrounding triggers wired to the Application
  lifecycle.

The engine in this module is the brain; M12 supplies the body.
