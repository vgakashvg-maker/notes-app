# M07 — Attachment Pipeline

> **Module ID**: `M07`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 3–4 days
> **Depends on**: M03, M04

---

## Purpose

Bridge between the editor (which knows about an Attachment node) and the Storage Provider (which doesn't know what a note is). Encapsulates upload progress, retry, thumbnail generation, and reference persistence.

---

## Public Interface (the port)

```kotlin
interface AttachmentPipeline {
  suspend fun attach(noteId: NoteId, file: FileInput): AttachmentRef
  suspend fun resolveUrl(ref: AttachmentRef): String   // short-lived signed URL
  suspend fun remove(ref: AttachmentRef)
  fun uploadProgress(ref: AttachmentRef): Flow<Progress>
}

data class Progress(val bytesSent: Long, val bytesTotal: Long, val state: State)
sealed class State {
  object Pending: State()
  object Uploading: State()
  object Done: State()
  data class Failed(val cause: Throwable): State()
}
```

---

## Responsibilities

- Calls StorageProvider.upload() (M3), gets externalId, writes AttachmentRef to DB (M4) atomically.
- Generates thumbnails for images on the client before upload (saves bandwidth + Drive quota).
- Handles 'attachment dangling': a scheduled job warns if a note references a missing external file.
- Resolves to a signed URL via M3 only on demand; never cache URLs.
- Progress reporting for UI (Android upload indicator, web file pill).

---

## Deliverables

- Android library `attachments-android`.
- Web library `attachments-web`.
- Edge Function `attachments/validate` (periodic dangling-ref check).
- Tests for happy path, network failure, and dangling-reference detection.

---

## Relevant Data Model

- `attachments_refs`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/attachments/validate (cron, internal)`

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
You are implementing module M7 (Attachment Pipeline) of the Evernote-like notes
app. Read `tech-specs/M07-attachment-pipeline.md` before starting.

Prerequisites:
  - M3 (storage-google-drive) is done — `StorageProvider.upload()` works.
  - M4 (notes-core) is done — `attachments_refs` table exists.

Your job:
  1. Implement `AttachmentPipeline` for web and Android.
  2. Client-side thumbnail generation for images: max 800px on longest edge,
     JPEG quality 80. Upload thumbnail + original; reference both in
     `attachments_refs.thumbnail_id` and `attachments_refs.external_id`.
  3. Upload is a 3-step transaction:
       a) Call M3 upload (gets externalId)
       b) Insert attachments_refs row (gets attachment id)
       c) If b fails, call M3 delete to avoid orphans
  4. `uploadProgress(ref)` returns a Flow that emits Progress values during
     upload. Wire to the Tiptap attachment node (web) and Compose progress
     indicator (Android).
  5. Edge Function `attachments/validate`: runs daily via pg_cron; for each
     attachments_refs row, attempts M3 metadata fetch; on 404, writes a row
     to a `dangling_attachments` table for user review.

Tests:
  - Unit: upload happy path, upload failure rollback (no orphaned Drive file),
    thumbnail generation produces a correctly-sized JPEG.
  - Integration: attach a real file, retrieve via signed URL, delete, verify
    Drive file is gone.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.7
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
