# ADR 0006 — Sync conflict policy

Date: 2026-05-21
Status: Accepted

## Context

The Android client is offline-first. When the device reconnects, the
local cache may have unflushed mutations *and* the server may have rows
the client has not yet seen. A deterministic, simple, audit-able conflict
policy is the difference between users trusting the app and uninstalling
it.

## Decision

A row coming from the server is a **conflict** with the local cache iff:

```
remote.updated_at > local.updated_at
        AND
local row has at least one PENDING / IN_FLIGHT outbox entry
```

(Strict inequality. Equal timestamps are treated as no-op even under
clock skew — applying twice is cheap and incorrect mutation is not.)

When that holds, the conflict resolver returns a merged note (server
wins) plus a separate **conflict copy** (local body preserved) placed
in an auto-created `Conflicts` notebook. The field-level merge rules:

| Field             | Policy           | Reasoning |
|-------------------|------------------|-----------|
| `body_json`       | **remote wins**  | Last-writer-wins for content. The local body is never lost — it lands in the conflict copy. |
| `title`           | **remote wins**  | Treated as non-content. If the user re-titled both clients to different values, the local title also survives via the conflict copy. |
| `notebook_id`     | **remote wins**  | Same reasoning. Move conflicts are rare; the local position is recoverable from the conflict copy if the user cares. |
| `tags`            | **union**        | Tag adds are commutative; the worst case is the user has to delete a tag once. No data lost. |
| `is_pinned`, `is_trashed` | **remote wins** | Non-content prefs. Server is source of truth. |
| `ai_excluded`     | **remote wins**  | User preference, set rarely. |

## Alternatives considered

- **Local wins**: rejected. The point of sync is that the server is the
  durable source of truth across devices; "my last edit was on
  the other device" is a common case and we should not lose it.
- **Three-way merge of body** (operational transform or CRDT): rejected
  for V1. ProseMirror docs over CRDTs are non-trivial and the audience
  here is single-user multi-device. The cost of a clear, recoverable
  conflict copy is one extra note per genuine conflict.
- **Surface a conflict UI and ask the user**: rejected as the default —
  it puts a modal in the middle of normal sync. The conflict copy *is*
  the UI: it's a note the user can open, compare, and merge by hand.
- **Tag intersect instead of union**: rejected. Subtractive merges
  silently drop the user's work.

## Idempotency

We do not introduce a dedicated idempotency-key column. Instead:

- INSERT: client generates `id` locally → a retried INSERT hits the
  PRIMARY KEY and PostgREST returns 409, which the flusher maps to
  `Applied`.
- UPDATE / SetTrashed: idempotent by construction.
- AddTag / RemoveTag: the `(note_id, tag_id)` PK on `note_tags` makes
  duplicate inserts and absent deletes no-ops.

This trades a missing audit trail (we cannot tell whether a 409 was a
true duplicate or a true conflict) for a much smaller schema. The
flusher logs every 409 in the row's `last_error`-style telemetry; M14
Sentry breadcrumbs surface them when investigating.

## Consequences

- The user occasionally has a `[Conflict]` note to deal with. Worth it
  for the guarantee that no work is lost.
- The Conflicts notebook is auto-created lazily. Settings should expose
  a "purge Conflicts notebook" action so users can clean it up after
  resolving.
- Future schema changes that add `notes` columns must declare a
  conflict policy in this ADR — the resolver knows about every field;
  silent passthroughs are an anti-pattern.

## Validation

- Unit tests in `ConflictResolverTest.kt` cover all five branches of
  the decision tree.
- The integration test in M12 (two-emulator) is the end-to-end
  acceptance for the policy.
