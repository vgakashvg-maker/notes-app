# notes-android

Gradle multi-project root for the Kotlin/Android side of notes-app.

Sub-modules:

- [`app`](app/) — **M12** — the Android Application: Compose, Hilt,
  Material 3, single-activity Compose Nav. The composition root that wires
  every other module into the Android UI.
- [`core-domain`](core-domain/README.md) — M01 — pure-Kotlin domain types.
- [`auth-android`](auth-android/) — M02 — Supabase auth adapter.
- [`notes-android`](notes-android/) — M04 — NotesService twin.
- [`editor-schema`](editor-schema/) — M06 — frozen ProseMirror schema.
- [`storage-android`](storage-android/) — M03 — Google Drive adapter.
- [`attachments-android`](attachments-android/) — M07 — attachment pipeline.
- [`sync-core`](sync-core/) — M05 — pure-Kotlin sync engine.

## Build & test

```powershell
# From notes-app\packages\android
.\gradlew.bat test                  # all JUnit5 cases across all modules
.\gradlew.bat :app:assembleDebug    # debug APK
.\gradlew.bat :app:assembleRelease  # signed AAB (needs keystore env)
```

CI runs `./gradlew test --stacktrace` on every PR and push to main.

## Toolchain

- JDK 17 (Temurin) for library modules; Android Studio's JBR 21 also works
  via the Foojay toolchain resolver pinned in `settings.gradle.kts`.
- Kotlin 2.0.21 (JVM + Android).
- Gradle 8.10.2 (pinned in `gradle/wrapper/gradle-wrapper.properties`).
- Android Gradle Plugin 8.7.3 (`build.gradle.kts`).
- `compileSdk 35`, `minSdk 28`, `targetSdk 35`.

## SDK location

The Android SDK path is read from `local.properties` (gitignored). For
new checkouts, copy the example:

```properties
# packages/android/local.properties
sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

## App composition root

`app/src/main/kotlin/app/notes/android/NotesApp.kt` is the
`@HiltAndroidApp`. Hilt modules live in `app/.../di/` — one per concern:

- `AppModule` — shared singletons (Ktor HttpClient, kotlinx-serialization
  Json, the Supabase URL/anon-key Qualifiers, `SessionTokenStore`).
- `ChatModule` — wires `ChatStreamSource` (Ktor SSE) for the chat screen.

`AuthModule` / `NotesModule` / `StorageModule` / `SyncModule` land when
their concrete adapter bindings (Ktor SupabaseAuthHttp, Room DAOs, etc.)
land; M05/M02 are shape-ready but the persistence binding is the M12
follow-up that fills them in.
