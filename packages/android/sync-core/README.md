# sync-core (Kotlin)

The hardest module. Pure-Kotlin orchestration of:

- A durable **outbox** the UI writes to immediately (no network blocking).
- An **outbox flusher** that drains pending mutations FIFO with HTTP-status
  classification + exponential backoff.
- An **incremental puller** that walks pages of `updated_at > watermark`
  and feeds each row through the [conflict resolver](src/main/kotlin/app/notes/sync/ConflictResolver.kt).
- A **realtime merger** that consumes Supabase realtime events through the
  same resolver, so realtime and pull cannot diverge.

Android-specific bindings (Room DAOs implementing `OutboxStore` and
`LocalNoteStore`, WorkManager workers wrapping the loops, Supabase
Realtime client behind `RealtimeChannel`) land in M12 — they are not
needed here, and keeping them out means the engine is JVM-testable.

## State machine and conflict policy

See `docs/how-sync-works.md` and `docs/adr/0006-sync-conflict-policy.md`.

## Public surface

- `SyncEngine` — the port (`start`, `stop`, `syncStatus`, `forcePull`,
  `forcePush`, `setForegrounded`).
- `DefaultSyncEngine` — V1 implementation that composes the three loops.
- Ports: `OutboxStore`, `RemoteNotesApi`, `RealtimeChannel`,
  `LocalNoteStore`, `Clock`.
- `OutboxOp` (Insert / Update / SetTrashed / AddTag / RemoteTag),
  `OutboxRow`, `OutboxState`.
- `FlushOutcome` + `classifyHttpStatus(code, message)` so bindings don't
  re-derive the HTTP-to-outcome map.
- `ConflictResolver.resolve(local, remote, hasPending, …)` — the single
  decision point.

## Build & test

```powershell
.\gradlew.bat :sync-core:test
```
