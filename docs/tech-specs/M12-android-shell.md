# M12 — Android App Shell

> **Module ID**: `M12`
> **Complexity / Recommended AI dev**: Opus (scaffold) + Sonnet (screens)
> **Estimated duration**: 10–14 days
> **Depends on**: M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M15

---

## Purpose

Top-level Android app: navigation graph, theme, dependency-injection wiring (Hilt), splash, sign-in, main shell. This is the composition root that wires every module together for the Android client.

---

## Public Interface (the port)

```kotlin
@HiltAndroidApp
class NotesApp : Application() {
  // Hilt modules provide each port → concrete adapter binding:
  //   AuthProvider           → SupabaseAuthAdapter
  //   NotesService           → SupabaseNotesAdapter
  //   StorageProvider        → GoogleDriveAdapter
  //   CalendarProvider       → GoogleCalendarAdapter
  //   AIServices             → BackendAIServicesAdapter (calls Edge Functions)
  //   SyncEngine             → SyncEngineImpl
  //   NotificationProvider   → AndroidNotificationProvider
}
```

---

## Responsibilities

- Single-activity Compose Navigation with these top-level destinations: Today, Notes, Search, Chat, Settings.
- Material 3 theming with dynamic color; dark mode default.
- Hilt DI with one module per port for easy mocking and adapter swaps.
- Sentry SDK initialized in onCreate.
- Splash → Auth → Main shell flow.
- Edge-to-edge / predictive back gestures.

---

## Deliverables

- Compiling Android app that runs end-to-end: sign in → note list → editor → AI chat → settings.
- Internal-track Play Store build (signed AAB).
- Compose Navigation graph documented.
- Hilt DI graph documented in `docs/android-di.md`.

---

## Relevant Data Model

_(none — this module doesn't directly own DB tables)_

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

_(none — this module is internal-facing)_

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
You are implementing module M12 (Android App Shell) of the Evernote-like notes
app. Read `tech-specs/M12-android-shell.md` before starting.

Prerequisites: M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M15 all done.
Each provides a library/module that this app pulls together.

Your job:
  1. Create the Android app module with Compose, Hilt, Compose Navigation.
  2. Targets: minSdk 28, compileSdk 34 (current at time of writing).
  3. Composition root: NotesApp : Application with @HiltAndroidApp.
  4. Hilt modules — one file per port:
       AuthModule, NotesModule, StorageModule, CalendarModule, AIModule,
       SyncModule, NotificationsModule. Each binds the interface to the
       concrete adapter.
  5. Navigation graph (single-activity):
       splash → signIn (if not authed) → main
       main {
         today, notes, search, chat, settings
       }
       editor (modal from notes or today)
  6. Theme: Material 3 with dynamicColor on Android 12+, fallback to a custom
     palette below. Dark theme as default.
  7. Initialize Sentry in onCreate (read DSN from BuildConfig).
  8. On app start, kick off SyncEngine.start() in Application scope.
  9. Wire SignInScreen (from M2) at the gate; on success, navigate to today.
  10. Settings screen embeds M15's AI settings sub-screen.

Build outputs:
  - signed AAB for Play internal track.
  - Document the keystore management approach in
    `docs/android-release.md` — do NOT commit the keystore.

Tests:
  - Macrobenchmark cold-start time < 1.5s on a Pixel 6 / equivalent.
  - Espresso end-to-end test: sign in → create note → see in list.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.12
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
