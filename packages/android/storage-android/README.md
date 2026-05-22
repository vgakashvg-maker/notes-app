# storage-android (Kotlin)

The Kotlin twin of `@notes-app/storage`. Pure-JVM Kotlin so the adapter
logic is testable without the Android SDK; the Ktor binding behind
[DriveHttp] lands in M12.

## Public surface

- `GoogleDriveAdapter(http, tokenProvider, backoff)` — implements
  `app.notes.domain.StorageProvider`.
- `DriveHttp` — wire-level port (find / create / simple+resumable
  upload / putChunk / getMetadata / delete).
- `BackoffConfig` + `retry()` — full-jitter exponential backoff.
- `InputStreamChunkSource` — 8 MB chunker for resumable uploads.
- `isRetriable(err)` — the same classifier the TS twin uses, exposed
  for binding implementers.

## Build & test

```powershell
.\gradlew.bat :storage-android:test
```
