# @notes-app/storage

The cross-platform storage adapter. V1 ships Google Drive only; the
`StorageProvider` port (in `@notes-app/domain`) is shaped so OneDrive,
S3, and Dropbox slot in as drop-in adapters with no changes to consumers.

## Public surface

- `GoogleDriveAdapter` — the V1 adapter. Constructed against a
  structural `DriveHttpClient` port so the package never imports the
  heavy `googleapis` library. The production binding (M06 web / M12
  Android shell) wraps `fetch` (web) or Ktor (Android).
- `DriveHttpClient` — six wire methods: `findAppFolder`,
  `createFolder`, `simpleUpload`, `startResumableUpload`, `putChunk`,
  `getMetadata`, `delete`. Each method is the level at which Drive's
  REST surface differs — splitting at these seams keeps the adapter
  unit-testable.
- `retry()` + `DEFAULT_BACKOFF` — full-jitter exponential backoff (max
  3 retries, 300 ms → 5 s cap). Adapters classify retriable errors via
  `StorageError`.
- `sign()` + `parseSignRequest()` — pure-logic backing for the
  `storage/sign` Edge Function. The Deno entry under
  `supabase/functions/storage/sign/index.ts` wires the executor.

## Folder caching

`ensureAppFolder()` searches for an existing `NotesApp` folder at Drive
root on first call, creates one if missing, and caches the id for the
lifetime of the adapter instance. Re-instantiate on user switch — the
adapter is stateless beyond this cache, so this is cheap.

## Resumable upload cutover

Files under `SIMPLE_UPLOAD_THRESHOLD_BYTES` (5 MB) go through Drive's
multipart endpoint in one call. Anything larger streams through the
resumable upload session in 8 MB chunks (the Drive-recommended size
that's a multiple of 256 KB).

The adapter pulls from `FileInput.stream()` lazily so we never
materialise the full file in memory. If the stream delivers fewer
bytes than `sizeBytes` advertises, the upload aborts with a
`StorageException(TransportError)` — better than uploading a truncated
file.

## Retry policy

The flusher classifies HTTP outcomes:

- 2xx → success
- 401 → `Unauthorized` — surfaced immediately so the auth module can
  refresh the token and the caller can retry
- 404 → `NotFound`
- 408 / 429 / 5xx → `UpstreamError`, retriable (jittered backoff)
- Other 4xx → `UpstreamError`, NOT retriable

Caller controls everything via the `BackoffConfig` constructor option;
tests use `delay: async () => {}` to keep the suite fast.

## Adding a new adapter (e.g. OneDrive)

1. Implement `StorageProvider` from `@notes-app/domain`. The interface
   is `id`, `upload`, `getDownloadUrl`, `delete`, `ensureAppFolder` —
   five suspendable methods.
2. Add the new value to `StorageProviderId` in
   `packages/domain/src/enums.ts` AND the Kotlin twin in
   `packages/android/core-domain/.../Enums.kt`.
3. Wire the new adapter at the DI boundary in M06 (web) / M12
   (Android). Use the same `AuthProvider.providerAccessToken(...)`
   pattern to keep auth out of the adapter.
4. If the provider exposes pre-signed URLs natively (e.g. S3), short-
   circuit `getDownloadUrl()`; otherwise mirror the Drive pattern with
   a `storage/sign`-style Edge Function.
5. Add a row to ADR 0007 documenting the scope choice.

The rest of the app should not need any changes — that's the whole
point of the port.

## Where the UI lives

Drag-and-drop and the attachment picker are M07 (Attachment Pipeline)
+ M06/M12 (editor surfaces). This module is the wire layer only.
