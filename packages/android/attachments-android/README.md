# attachments-android (Kotlin)

Kotlin twin of `@notes-app/attachments`. Same three-step atomic upload
+ rollback, same `ProgressBus`-with-replay semantics, same
soft-failure thumbnail behaviour.

## Public surface

- `AttachmentPipeline` — port shape that mirrors the TS twin. Lives
  in this module (not core-domain) because `Flow<Progress>` would
  pull `kotlinx-coroutines-core` into the pure-types layer.
- `DefaultAttachmentPipeline` — V1 implementation. Constructor takes
  a `StorageProvider`, an `AttachmentsRepo`, an optional
  `ThumbnailGenerator`, and (in tests) a `ProgressBus` + `newClientId`
  override.
- `AttachmentsRepo` — port for `attachments_refs` ops. The Android
  binding (M12) wraps supabase-kt; tests pass a fake.
- `ThumbnailGenerator` — `fun interface` the host wires to
  `android.graphics.Bitmap` (M12). Thumbnail dims come from
  `app.notes.domain.ThumbnailSpec`.
- `runValidator()` — pure-logic backing for the validator. The Edge
  Function wires identical logic on the TS side; this Kotlin twin is
  here for parity and for any future user-triggered "scan now" path.

## Build & test

```powershell
.\gradlew.bat :attachments-android:test
```
