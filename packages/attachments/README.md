# @notes-app/attachments

Bridges the editor (which knows about an `attachment` node) and the
storage provider (which doesn't know what a note is). Provides upload
progress, atomic rollback, and the dangling-reference validator.

## Public surface

- `DefaultAttachmentPipeline` — implements `AttachmentPipeline` from
  `@notes-app/domain`. Constructor takes a `StorageProvider`, an
  `AttachmentsRepo`, an optional `ThumbnailGenerator`, and (in tests) a
  `ProgressBus` + `newClientId()` override.
- `AttachmentsRepo` — port for `attachments_refs` inserts, deletes,
  validation paging, and dangling-record persistence. The production
  binding wraps PostgREST under the user's JWT (RLS); the
  Edge-Function side uses the service-role key.
- `ThumbnailGenerator` — port the host wires to a platform thumbnailer
  (HTMLCanvasElement for web, android.graphics.Bitmap for Android).
  Thumbnail dimensions come from `ThumbnailSpec` in the domain layer
  (800 px on the longest edge, JPEG quality 80).
- `ProgressBus` — pub/sub with last-value replay so a late subscriber
  immediately sees the most recent `Progress`.
- `runValidator()` — pure-logic backing for the `attachments/validate`
  Edge Function.

## Three-step atomic upload

```
   1. storage.upload(file)             → externalId
   2. (optional) storage.upload(thumb) → thumbnailId       [soft-failure]
   3. repo.insert({ externalId, … })   → AttachmentRef
        │
        └─ on failure: storage.delete(externalId)
                       storage.delete(thumbnailId?)
                       then re-throw
```

The user never observes an `attachments_refs` row without bytes, nor
bytes without a row.

A thumbnail upload **failure** is treated as a soft failure — the
attachment is created without `thumbnail_id`. The validator catches the
missing-thumbnail case asynchronously, so the user is never blocked
from attaching the file.

## Remove ordering

`remove(ref)` deletes the DB row **first**, then the remote bytes.
Reasoning: RLS owns the safety net on the DB side, and a remote
delete that fails (Drive 503) is better handled as an orphan the
validator finds later than as a row the UI shows with broken bytes.

## Validator

`runValidator(deps)`:

1. Pages through `attachments_refs`.
2. Probes each row's `external_id` (and `thumbnail_id` if present)
   against storage.
3. Records `missing` results in `dangling_attachments` for user review.
4. Skips recording on `error` results so the job is safe to re-run.

The Edge Function (`supabase/functions/attachments/validate`) wires
the dependencies and runs daily via pg_cron (see the migration
`20260522123000_dangling_attachments.sql`).

## Where the UI lives

- The Tiptap attachment node + drag-and-drop (web) — M13.
- The Compose attachment pill + upload indicator (Android) — M12.

Both consume `AttachmentPipeline.uploadProgress(ref)` to drive their
indicators.
