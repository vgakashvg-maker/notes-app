# M03 — Storage Provider Module

> **Module ID**: `M03`
> **Complexity / Recommended AI dev**: Opus
> **Estimated duration**: 5–7 days (V1: Google Drive only)
> **Depends on**: M01, M02

---

## Purpose

Abstract file storage behind a StorageProvider port. V1 ships Google Drive only; the port is designed so OneDrive (V2), S3, and Dropbox are drop-in adapters.

---

## Public Interface (the port)

```kotlin
interface StorageProvider {
  val id: StorageProviderId
  suspend fun upload(file: FileInput, folderHint: String?): RemoteFile
  suspend fun getDownloadUrl(externalId: String, ttlSeconds: Int = 300): String
  suspend fun delete(externalId: String)
  suspend fun ensureAppFolder(): String     // returns root folder ID
}

data class RemoteFile(
  val externalId: String,
  val name: String,
  val mimeType: String,
  val sizeBytes: Long
)

data class FileInput(
  val bytes: ByteArray,                 // for small files
  val stream: () -> InputStream,        // for large files (lazy)
  val name: String,
  val mimeType: String,
  val sizeBytes: Long
)
```

---

## Responsibilities

- GoogleDriveAdapter uses Drive v3 REST API with the user's OAuth token.
- Create and reuse a single app-scoped folder `/NotesApp/` so the user can audit what we wrote.
- Upload returns a `RemoteFile` { externalId, name, mime, size }.
- Signed/download URLs are short-lived (default 5 min) and never persisted.
- Resumable uploads for files > 5 MB.
- Retry with exponential backoff on 5xx and 429.
- Graceful handling of quota-exceeded errors with a user-friendly message.

---

## Deliverables

- Library `storage-google-drive` (Kotlin for Android + TS for web).
- Integration tests against a real test Google account.
- ADR `docs/adr/0002-drive-scopes.md` documenting why we chose `drive.file` (per-file scope) over `drive` (full-Drive scope).
- README explaining how to add a future adapter (e.g., OneDrive) — concrete checklist.

---

## Relevant Data Model

- `attachments_refs`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/storage/sign (returns signed URL for an existing externalId)`

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
You are implementing module M3 (Storage Provider — Google Drive only for V1) of
the Evernote-like notes app. Read the full spec in
`tech-specs/M03-storage-provider.md` before starting.

Prerequisites complete:
  - M1 (core-domain), M2 (auth) already implemented.
  - The user is signed in with Google and we have a fresh `drive.file` OAuth
    token via M2's `providerAccessToken(GOOGLE_DRIVE)`.

Your job:
  1. Implement the `StorageProvider` interface in core-domain (TS + Kotlin).
  2. Implement `GoogleDriveAdapter` for web and Android. Use the Drive v3 REST
     API; do NOT use the heavy Google client libraries — fetch/OkHttp is
     enough and keeps bundle size low.
  3. `ensureAppFolder()` should create `/NotesApp/` on first call and return
     the folder ID; subsequent calls return the cached ID.
  4. Implement resumable upload for files > 5 MB per Drive's resumable upload
     protocol.
  5. Implement Supabase Edge Function `storage/sign` that takes an externalId
     and returns a signed download URL (use Drive's `webContentLink` flow or
     a short-lived access-token URL).
  6. Add exponential backoff on 5xx/429 (max 3 retries, jittered).

Tests:
  - Unit-test the adapter with a fake HTTP layer (success, 401, 429, 5xx).
  - One integration test against a real test account: upload a 1KB image,
    download via signed URL, delete, confirm deletion.

Document scope choice in `docs/adr/0002-drive-scopes.md`. Use `drive.file`
(per-file scope) — explain why this is the right tradeoff for user trust.

Definition of Done is in the spec. Run all tests before declaring done.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.3
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
