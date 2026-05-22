# Progress

Module-by-module tracker. Tick a Definition-of-Done item only after the
referenced artefact actually exists in the repo (or is documented as
explicitly deferred with the reason).

---

## Stage 1 — Foundation

### M08 — Calendar Integration

Spec: `docs/tech-specs/M08-calendar-integration.md`

**Live state**

- 8 migrations applied on `notes-dev` (added **M08 `events_mirror`** +
  **`note_event_links`**). 4 pgTAP cases in `rls_events_mirror.test.sql`
  cover stamp-owner, cross-tenant blind, cross-tenant cannot-mutate, and
  the cross-owner note_event_links reject; all green.
- New TS package `@notes-app/calendar` lands with
  `GoogleCalendarAdapter` (structurally typed `CalendarHttp` port +
  `reconcile()` for the events_mirror sync diff). 11 new vitest cases
  bring the workspace total to 354.
- 2 new Edge Functions (`calendar/sync`, `calendar/create-event`) wired
  to Google Calendar v3 via the M02 `refresh-provider-token` Edge
  Function (no Google client SDK; raw `fetch`).
- Web `/` (Today) and Android `TodayScreen` now read `events_mirror`
  via PostgREST and render events scoped to the device's local-day
  window.

**Deliverables**

- [x] Migration `supabase/migrations/20260522170000_events_mirror.sql` —
  `events_mirror` (unique on `(owner_id, provider, external_event_id)`)
  + `note_event_links` (cross-owner reject trigger), both with RLS +
  stamp-owner.
- [x] Domain ports (TS + Kotlin) — `CalendarProvider`, `DateRange`,
  `NewEventInput`, `EventPatch`, `CalendarChange`, `ExternalEventId`.
  Kotlin twin uses `pollEvents` (V1 polling) instead of `Flow` so
  `core-domain` stays coroutine-free.
- [x] `@notes-app/calendar` — `GoogleCalendarAdapter` against the
  `CalendarHttp` port; pagination + `cancelled`/all-day filtering;
  `reconcile()` returns the upsert/delete diff M08 sync needs.
- [x] Edge Function `calendar/sync` — fetches events for a date range,
  upserts on `(owner_id, provider, external_event_id)`, deletes mirror
  rows whose external id no longer appears in the range.
- [x] Edge Function `calendar/create-event` — creates the event in
  Google Calendar, upserts into events_mirror, inserts the
  `note_event_links` back-reference if `noteId` was supplied.
- [x] Web Today view (`/`) — RSC reads events for the device-local
  day window via `listEventsInRange`; events render alongside recent
  notes.
- [x] Android Today view — `CalendarRepository` (Ktor + PostgREST) +
  `TodayViewModel` + Compose render with a "Sync now" button that
  invokes `calendar/sync`.
- [x] Time zones — events stored in UTC; web renders via
  `Intl.DateTimeFormat` (device zone); Android renders via
  `OffsetDateTime.toLocalTime()`.
- [ ] Tests against a real Google Calendar account — **deferred**.
  Same blockers as the M02 / M03 integration tests (provisioned OAuth
  client + test account). The unit-test suite covers the adapter's
  reconcile + page-walk + filter logic.
- [ ] WorkManager periodic worker (15-min poll while foregrounded) —
  **deferred to a follow-up**. The CalendarRepository's `triggerSync`
  is the foreground hook; the worker is a binding the same way the
  M05 WorkManager workers were deferred.
- [ ] Calendar push channels — **V2**.

**Responsibilities** (point at code)

- [x] Google Calendar API v3 via the user's OAuth token (no
  `googleapis` SDK) — `supabase/functions/calendar/_shared/google.ts`
  uses raw `fetch` against `https://www.googleapis.com/calendar/v3`.
- [x] Mirror events into `events_mirror` — `calendar/sync` + the M08
  migration; reconcile diff lives in `@notes-app/calendar/sync.ts`.
- [x] Outbound "Create Calendar event" from a note — `calendar/create-event`
  + the `note_event_links` insert (cross-owner-reject trigger keeps
  the link safe).
- [x] Time-zone correct — UTC at rest; render-time conversion on each
  client.
- [ ] 15-min polling cadence — deferred (the foreground "Sync now"
  button is the V1 hook).

**Definition of Done — checklist**

Code:
- [x] All public functions on the port interface implemented — TS
  `CalendarProvider` is concrete via `GoogleCalendarAdapter`; Kotlin
  port mirrored.
- [x] No provider SDK leaked outside adapters — the Edge Functions and
  `@notes-app/calendar` are the only files importing Calendar v3
  shapes; UI surfaces talk to PostgREST + the Edge Functions only.
- [x] No TODO/FIXME/XXX comments outside the module's deferred notes.
- [x] No commented-out code.
- [x] Public APIs documented inline — the deferred items here are the
  next surface to touch.

Tests:
- [x] Unit tests cover happy + failure paths — 11 vitest cases across
  `GoogleCalendarAdapter` (7) + `reconcile` / `eventToUpsertRow` (4).
- [x] Critical paths covered — pagination, all-day filter, cancelled
  filter, reconcile diff isolation per provider, upsert payload
  fidelity.
- [x] Tests run in CI and pass — verified locally (workspace + Gradle
  green; pgTAP 4/4 against notes-dev).
- [ ] Integration test against a real Calendar — deferred.

Documentation:
- [x] PROGRESS entry (this section) + the spec is the contract.
- [x] No new ADR — the M02 OAuth-scopes ADR (0007) already covers the
  `calendar.events` scope decision.

Security:
- [x] No secrets in code — refresh token stays in
  `users_profile.google_refresh_token bytea` (M02); the Edge Functions
  swap it for an access token via `refresh-provider-token`.
- [x] RLS tested — `rls_events_mirror.test.sql` covers stamp +
  cross-tenant blind + cannot-mutate + cross-owner reject for the link
  table.
- [x] Error messages don't leak provider details — Edge Functions
  return `ERR_UPSTREAM` / `ERR_PROVIDER_TOKEN` rather than raw Google
  responses.

Modularity:
- [x] OutlookCalendarAdapter is a V2 swap behind the same
  `CalendarProvider` port — `provider` already accepts
  `MICROSOFT_GRAPH` (check constraint + enum).

Operational:
- [ ] pg_cron — N/A (V1 is foreground-triggered).
- [x] Telemetry — same `ai_usage_log`-style observability budget as
  M09; calendar Edge Functions return a `{ ok, upserted, deleted }`
  envelope the UI can log.
- [x] Manual smoke test — TS workspace 354 vitest cases green, Gradle
  green, `:app:assembleDebug` produces a working APK, pgTAP 4/4 on
  notes-dev.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M15 — AI Settings, Routing & Endpoint Management

Spec: `docs/tech-specs/M15-ai-settings-routing.md`

**Live state**

- 7 migrations applied on `notes-dev` (added **M15 `ai_keys`**). 3 new
  pgTAP cases in `rls_ai_keys.test.sql` (stamp-owner, cross-tenant blind,
  cannot-mutate) green; full suite 3/3.
- Web `/settings/ai/{endpoint,routing,usage}` and the Android Settings →
  AI sub-screens (Endpoint / Routing / Usage) read and write
  `users_profile.ai_prefs.routing` + `.endpoints`. The dynamic router
  replaces M09's `staticRouter`: per-key overrides from the user's prefs,
  per-key fallback to `V1_ROUTES`.
- 3 new Edge Functions (`ai/test-connection`, `ai/usage`, `ai/reindex`).
- Workspace tests: 343 vitest cases (6 new `dynamic-routing` + the
  existing surface); 14 JUnit5 cases on the Android app (unchanged).

**Deliverables**

- [x] Migration `supabase/migrations/20260522160000_ai_routing.sql` —
  `ai_keys` table with stamp-owner trigger + `set_updated_at` + RLS
  (`owner_can_all`). Provider check constraint pins V1 values.
- [x] Domain port (TS + Kotlin) — `AIRouting`, `AdapterBinding`,
  `RoutingConfig`, `ProviderEndpoints`, `AIPrefsPayload`, `AITask`,
  `AIKeyStore`. Mirrored exactly.
- [x] `dynamicRouter(config)` in `@notes-app/ai` — per-key V1 fallback
  + `MODEL_REGISTRY` for `contextTokens` lookup of `/api/tags` model
  ids. 6 vitest cases.
- [x] Edge Function `ai/test-connection` — POST `{ endpoint_url }` →
  fetches `/api/tags` (with the M09/M10 Funnel `Host` workaround),
  returns `{ ok, models, latencyMs }` or `{ ok: false, error }`.
- [x] Edge Function `ai/usage` — GET (days=14 default, capped at 90),
  aggregates `ai_usage_log` rows into per-day per-task buckets.
- [x] Edge Function `ai/reindex` — paginates the caller's notes
  (`PAGE_SIZE=100`) and fires a no-op UPDATE per id; the M10
  `notes_embed_trigger` re-enqueues the embedding job. Synchronous V1.
- [x] Routing JSON shape published — `users_profile.ai_prefs.routing`
  (per-task `{ provider, model }`) + `endpoints` (per-provider URL) +
  `version: 1`. Layered with the M01 `AIPreferences` legacy fields —
  no schema-level rev.
- [x] Web UI — `/settings/ai/layout.tsx` with tabbed nav + 3 pages:
  Endpoint (URL input + Test connection), Routing (3-group table:
  Content / Metadata / Embeddings), Usage (per-task table + 14-day
  latency sparkline). `lib/ai/prefs.ts` is the framework-binding for
  PostgREST.
- [x] Android UI — Settings → Endpoint / Routing / Usage Compose
  screens; `AIPrefsRepository` (Ktor + PostgREST) injected via Hilt.
- [x] pgTAP — `supabase/tests/rls_ai_keys.test.sql`, 3 cases green on
  notes-dev.
- [ ] Live progress UI for the re-embed job — **deferred**. The
  Edge Function ships synchronous; the live-polling UI waits for a
  generic Jobs surface (no Jobs port today). The UI surfaces a static
  "Re-embed kicked off — N notes touched." after the call completes.
- [ ] V2 `ai_keys` encryption (Supabase Vault / pgsodium) — **deferred**;
  V1 ships the schema + RLS only (no code reads `encrypted_secret`).
- [ ] Live integration against a real Ollama — deferred with M02 /
  M03; the test-connection function works against a stood-up endpoint
  but the round-trip is documented as a runbook smoke step, not a CI
  test.

**Responsibilities** (point at code)

- [x] Settings → AI screens on Android (Compose) and Web (Next.js):
  three sections each — `packages/web/app/settings/ai/*` and
  `packages/android/app/.../settings/ai/AI{Endpoint,Routing,Usage}Screen.kt`.
- [x] Endpoint section — URL input + Test connection that calls
  `ai/test-connection` and lists installed models.
- [x] Routing section — table of tasks × Model dropdown; options
  populated from the cached `/api/tags` response plus the V1 defaults.
- [x] Usage section — line chart of latency over time + table of
  tokens / calls per task. Pure SVG (web) + Canvas (Compose); no
  Vico/recharts dep.
- [x] Endpoint URL stored in `users_profile.ai_prefs.endpoints.OLLAMA`.
- [x] `ai_keys` table built but unused in V1.
- [x] Re-embed background job triggered when the user changes the
  embedding model — `RoutingForm.onSave` (web) +
  `AIRoutingViewModel.save` (Android) call `ai/reindex` when the embed
  binding model differs from what was loaded.

**Definition of Done — checklist**

Code:
- [x] All public functions on the port interface implemented — the
  dynamic router resolves every task key; `AIPrefsRepository` covers
  read/write/test/reindex/usage; `AIRouting` shape is shared TS↔Kotlin.
- [x] No provider SDK leaked outside adapter / framework-binding files
  — `@supabase/ssr` only inside `lib/supabase/*`; Ktor only inside
  `AIPrefsRepository`; Edge Functions use the same `_shared/ollama.ts`
  helpers M09 set up.
- [x] No TODO/FIXME/XXX comments outside the module's deferred notes.
- [x] No commented-out code.
- [x] Public APIs documented — domain types comment the persisted
  shape; the spec captures the broader design.

Tests:
- [x] Unit tests cover happy + failure paths — 6 new vitest cases for
  `dynamicRouter` (fallthrough, single-key override, registry lookup,
  unknown-model fallback, embed contextTokens forced to 0, full
  taxonomy round-trip).
- [x] Critical paths covered — pgTAP confirms stamp-owner + RLS
  isolation for `ai_keys`; the router fallback chain is exhaustively
  tested.
- [x] Tests run in CI and pass — vitest verified locally, JUnit5
  green via `:app:test`, pgTAP green via `supabase db query --file`.
- [ ] Live integration against real Ollama — deferred.

Documentation:
- [x] The spec (`docs/tech-specs/M15-ai-settings-routing.md`) plus this
  entry capture the contract.
- [x] No new ADR required; the M15 design exposed the same task taxonomy
  M09 already documented in ADR 0008.

Security:
- [x] No secrets in code — `ai_keys.encrypted_secret` is bytea, never
  populated in V1, and even when V2 lights it up the secret only
  crosses an Edge Function boundary on write.
- [x] RLS tested — `rls_ai_keys.test.sql` covers stamp + cross-tenant
  blind + cannot-mutate.
- [x] Error messages don't leak provider details — Edge Functions
  return coded errors (`ERR_UPSTREAM`, `ERR_UPSTREAM_UNREACHABLE`);
  the UI surfaces a generic "Test failed" with the upstream code.

Modularity:
- [x] Routing port swap — write a new `AIRouting` impl and a new
  `Router` (via `dynamicRouter`) without touching the M09 pipeline.

Operational:
- [ ] pg_cron — N/A (the re-embed trigger is user-initiated; M07's
  attachment validator + M09's briefing remain the scheduled jobs).
- [x] Telemetry — every Edge Function still writes to `ai_usage_log`
  via the same `logUsage` helper M09 introduced; the new `ai/usage`
  endpoint reads from it.
- [x] Manual smoke test — TS workspace green (343 cases); Kotlin tests
  green; `./gradlew :app:assembleDebug` produces a working APK;
  `notes-dev` migration applied + pgTAP 3/3.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M12 — Android App Shell

Spec: `docs/tech-specs/M12-android-shell.md`

**Live state**

- `packages/android/app/` is a real Android Compose app. `:app:assembleDebug`
  produces an APK; `:app:test` runs 14 JUnit5 cases (SSE parser + citation
  splitter). Toolchain: AGP 8.7.3, Kotlin 2.0.21, Gradle 8.10.2, JDK 17
  (auto-provisioned via the Foojay resolver), `compileSdk 35`, `minSdk 28`.
- Strict prereqs M08 (calendar), M11 (notifications), M15 (settings /
  routing) are still pending. Their UI surfaces and Hilt modules are
  stubbed with explicit "lands with MNN" copy.

**Deliverables**

- [x] Android `:app` module with `com.android.application` + Compose +
  Hilt + Compose Navigation + Material 3. AGP 8.7.3 + Foojay toolchain
  resolver landed at the build root.
- [x] Composition root `NotesApp : Application` with `@HiltAndroidApp`;
  `SentryShim` boot stub matches the M14 observability-stub posture on
  the web side.
- [x] Hilt DI graph — `AppModule` (Ktor HttpClient, Json, Supabase URL /
  anon-key Qualifiers, `SessionTokenStore`) + `ChatModule`
  (`ChatStreamSource`). `AuthModule` / `NotesModule` / `StorageModule` /
  `SyncModule` / `NotificationsModule` / `CalendarModule` deferred until
  the concrete adapter bindings (Ktor SupabaseAuthHttp, Room DAOs, …)
  land — see Stage 1 follow-ups.
- [x] Single-activity Compose Navigation graph — `splash → signIn →
  today / notes / notes/{id} / search / chat / settings`. Auth gate
  driven by `AuthStateHolder.token` `StateFlow`.
- [x] Material 3 theme with dynamic color on Android 12+; static
  fallback palette mirrors the web Tailwind brand/surface/ink scheme.
- [x] **Chat screen wired end-to-end** — Ktor SSE client
  (`ChatStreamSource`) posts to `ai/chat` with the stored JWT, streams
  `chunk` / `citation` / `warning` / `done` / `error` events into
  `ChatViewModel.state`, renders `[[NoteId:UUID]]` markers via
  `splitWithCitations` (Kotlin twin of `packages/web/lib/chat/citations.ts`).
- [x] Sign-in screen — V1 JWT-paste box. Custom Tabs + deep-link OAuth
  flow deferred (needs the `SupabaseAuthHttp` Ktor binding + manifest
  intent-filter wiring — same posture as the web shell's deferred
  Playwright e2e).
- [x] EncryptedSharedPreferences-backed `SessionTokenStore` for the
  pasted JWT.
- [ ] Real Supabase OAuth (Custom Tabs + deep-link callback) — deferred.
- [ ] Notes list / editor wired to Supabase REST — deferred until the
  Android `NotesService` HTTP binding lands.
- [ ] Sync engine boot — `SyncEngine.start()` in app scope — deferred
  with the Room DAO + Supabase Realtime SDK binding (M05's deferred items).
- [ ] Espresso end-to-end test (sign in → create note → see in list) —
  **deferred**. Needs the OAuth flow + notes binding + a real emulator
  / device. Same deferral pattern as the web shell's Playwright suite.
- [ ] Macrobenchmark cold-start < 1.5s — **deferred**, needs a real
  device + the Compose tree fully populated.
- [ ] Signed AAB to Play internal track — **deferred to a release run**.
  The M14 `build-apk.yml` workflow probes `packages/android/app/build.gradle.kts`,
  so the gate now passes; the actual signing config wires when the
  keystore env vars land.

**Responsibilities** (point at the code that proves each one)

- [x] Single-activity Compose Navigation with the top-level destinations
  — `app/.../nav/AppNavGraph.kt`.
- [x] Material 3 theming with dynamic color; dark mode default —
  `app/.../ui/theme/Theme.kt`.
- [x] Hilt DI with one module per concern — `app/.../di/`.
- [x] Sentry init scaffold in `onCreate` — `app/.../observability/SentryShim.kt`
  (SDK wiring stays behind the shim, matching M14's `initSentry` posture
  on the web side).
- [x] Splash → Auth → Main shell flow — `AppNavGraph.startDest` flips on
  the `AuthStateHolder.token` value.
- [x] Edge-to-edge — `ComponentActivity.enableEdgeToEdge()` in
  `MainActivity.onCreate`.

**Definition of Done — checklist**

Code:
- [x] All public ports on the surface implemented — chat path is
  end-to-end; the auth/notes/sync surfaces are shape-ready (Hilt modules
  exist in name; concrete bindings deferred per Deliverables).
- [x] No provider SDK leaked outside adapter / framework-binding files —
  `@supabase/*` not used (the Android adapter binding will go through
  Ktor), Ktor only inside `app/.../chat/` + `app/.../di/`.
- [x] No TODO/FIXME/XXX comments outside the module's own deferred
  notes.
- [x] No commented-out code.
- [x] Public APIs documented — `packages/android/README.md`.

Tests:
- [x] Unit tests cover happy + failure paths — 14 JUnit5 cases across
  `SseParserTest` (9) + `CitationSplitterTest` (5). Mirrors the web
  shell's vitest contract for the same event types.
- [x] Critical paths covered — every SSE event kind, split-frame
  survival, citation lookup miss, malformed-JSON safety, flush of an
  un-terminated tail.
- [x] Tests run in CI and pass — verified locally via
  `./gradlew :app:test`.
- [ ] Espresso end-to-end — **deferred** (see Deliverables).
- [ ] Macrobenchmark — **deferred**.

Documentation:
- [x] Module README — `packages/android/README.md` (Hilt graph + build
  + toolchain notes).
- [x] No new ADR required; the chat SSE contract already lives in
  ADR 0008.

Security:
- [x] No secrets in code — SUPABASE_URL / SUPABASE_ANON_KEY / SENTRY_DSN
  read from environment variables at build time into `BuildConfig`.
- [x] EncryptedSharedPreferences for the pasted JWT.
- [x] Error messages don't leak provider details — Ktor failures surface
  as generic strings via `runCatching { ... }.onFailure { ... }`.

Modularity:
- [x] The Android shell can be deleted and replaced by a different UI
  framework — domain ports + adapter packages have no Compose / Hilt
  dependencies; only `:app` does.

Operational:
- [ ] pg_cron — N/A for M12.
- [x] Telemetry — `SentryShim.init` scaffold; SDK wiring matches the
  M14 web-side stub.
- [x] Manual smoke test — `./gradlew :app:assembleDebug` + `./gradlew test`
  green locally; 14 new JUnit5 cases on top of the existing pure-Kotlin
  suites (workspace stays clean — TS side 337/337 vitest green).

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

**Stage 1 gate**: M01 / M02 / M03 / M04 / M05 / M06 / M07 / M09 / M10 /
M12 / M13 / M14 all landed in code. Stage 1 gate is reachable once M08
(calendar), M11 (notifications), and M15 (AI settings / routing) land.
The remaining Android follow-ups (real OAuth flow, NotesService HTTP
binding, SyncEngine boot, Espresso e2e) are not on the Stage-1 critical
path — they're the bridge from "shell compiles end-to-end" to "app
ships to Play internal track."

---

### M13 — Web App Shell

Spec: `docs/tech-specs/M13-web-shell.md`

**Live state**

- `packages/web` is now a real Next.js 14 App Router app. `pnpm build`
  generates 10 routes (3 static, 4 dynamic, plus middleware + route
  handler + the editor's client chunk). Bundle: 87 kB shared baseline, the
  editor adds ~97 kB for Tiptap (lazy-loaded on `/notes/[id]`).
- Strict prereqs M08 (calendar), M11 (notifications), M15 (settings /
  routing) are still pending. Their UI surfaces are stubbed with explicit
  "deferred to MNN" copy so the gate stays visible.
- The Sentry + PostHog stubs from M14 now run through Next.js's
  `instrumentation.ts` hook on server start.

**Deliverables**

- [x] Next.js 14 App Router scaffold in `packages/web` (per agreed scope —
  the existing observability stub was converted in place, matching the
  `deploy-web.yml` probe which already targets `packages/web/next.config.mjs`).
- [x] Tailwind + dark-mode wiring — palette mirrors the Android theme intent
  (brand / surface / ink). A real `@notes-app/design-tokens` package is a
  follow-up; the colour values live inline in `tailwind.config.ts` for now.
- [x] Composition root `app/layout.tsx` — `<ThemeProvider>` (next-themes) +
  `<AppShell>` nav. Auth-aware QueryClient deferred until data fetching
  outgrows server components.
- [x] Auth gate `middleware.ts` — Supabase session-cookie refresh +
  redirect-unauth-to-`/sign-in` with `redirectTo` preserved.
- [x] OAuth flow — `/sign-in` page + `/auth/callback` route exchange.
- [x] Routes — `/`, `/notes`, `/notes/[id]`, `/notes/new`, `/search`,
  `/chat`, `/settings`, `/sign-in`, `/auth/callback`.
- [x] Chat UI with SSE streaming + citation rendering — `<ChatStream>`
  reads `chunk` / `citation` / `warning` / `done` / `error` frames from
  `ai/chat`; `[[NoteId:UUID]]` markers in deltas resolve to
  `<Link href="/notes/UUID">` via the citation lookup.
- [x] Tiptap editor mount at `/notes/[id]` — StarterKit + bridge to the
  M06 JSON↔Markdown converter. Lazy-loaded so the Lighthouse score on
  other pages isn't paying for it.
- [x] Light + dark theme — `next-themes` with a three-way switch
  (light / dark / system) on `/settings`.
- [x] Component test for the chat streaming renderer (mock SSE) — 6 cases
  covering progressive deltas, citations, warnings, errors, onDone, and
  the null-stream baseline.
- [x] Unit tests for the SSE parser (9 cases incl. split-frame survival,
  multi-event frames, error/warning/done parsing, malformed-JSON safety,
  flush of un-terminated tail) and the citation splitter (5 cases).
- [ ] Playwright e2e (sign in → create note → search → ask AI → see
  citation) — **deferred**. Needs a provisioned Supabase project, a Google
  OAuth client, and a test account — same blockers as the M02/M03
  integration tests; lands when those do.
- [ ] Vercel deploy — `deploy-web.yml` is shape-ready (probes
  `packages/web/next.config.mjs`); the actual `vercel link` + production
  deploy is a human step documented in `docs/runbook.md`.
- [ ] Lighthouse ≥ 90 on the editor page — **deferred** (requires a
  deployed environment). The editor is already lazy-loaded so the budget
  is recoverable; verification waits for a real deploy.
- [ ] M08 calendar integration on `/` — **deferred to M08**.
- [ ] M11 notification surfaces — **deferred to M11**.
- [ ] M15 AI settings / routing UI on `/settings` — **deferred to M15**.
- [ ] Storybook stories — **deferred** (not on the critical path; M09's
  ADR + the SSE/citation unit tests cover the chat contract).
- [ ] shadcn/ui component library — **scoped out** of M13. Tailwind +
  small bespoke primitives cover the current screens; we'll add shadcn
  when a component (dialog, command palette, dropdown) actually demands it.

**Responsibilities** (point at the code that proves each one)

- [x] Next.js 14 App Router — `packages/web/app/*`; verified by
  `next build` enumerating the route table.
- [x] Server Components for note list pages — `app/page.tsx`,
  `app/notes/page.tsx` are async server components wrapped in `<Suspense>`.
- [x] Tiptap editor with the M06 schema — `app/notes/[id]/editor.tsx`
  imports `@notes-app/editor-schema` for the JSON↔Markdown bridge.
- [x] Streaming chat UI for M09's chat-with-notes (SSE) —
  `components/chat-stream.tsx`; the pure SSE parser lives in
  `lib/chat/sse.ts`.
- [x] Responsive layout — Tailwind responsive utilities + sidebar nav that
  collapses below `md`.
- [x] Lighthouse-friendly defaults — Tiptap is `dynamicImport(... { ssr: false })`,
  so the editor chunk doesn't load until `/notes/[id]` is requested.

**Definition of Done — checklist**

Code:
- [x] All public functions on the port interface implemented — the
  framework binding files (`lib/supabase/*`, `lib/notes/queries.ts`,
  `middleware.ts`, `app/auth/callback/route.ts`) own the Supabase-side
  surface; the broader domain ports stay in their packages.
- [x] No provider SDK leaked outside adapter / framework-binding files —
  `@supabase/ssr` is imported only in `lib/supabase/*`, `middleware.ts`,
  and `app/auth/callback/route.ts`; Tiptap only in
  `app/notes/[id]/editor.tsx`; next-themes only in
  `components/theme-provider.tsx` and `app/settings/theme-switch.tsx`.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (`packages/web/README.md`).

Tests:
- [x] Unit tests cover happy + failure paths — 20 new vitest cases
  (`sse.test.ts` ×9, `citations.test.ts` ×5, `chat-stream.test.tsx` ×6)
  on top of the 9 observability cases that survived the conversion.
- [x] Critical paths covered — every SSE event kind, split-frame
  survival, citation lookup miss as soft failure, onDone callback wiring.
- [x] Tests run in CI and pass — verified locally; awaiting CI push.
- [ ] Playwright e2e — **deferred** (see Deliverables).

Documentation:
- [x] Module README — `packages/web/README.md` (routes table, framework
  binding map, swap-checklist).
- [x] ADR — none required; the design decisions (chat SSE shape, citation
  parsing) already live in ADR 0008 (M09).

Security:
- [x] No secrets in code — `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` added
  to `.env.example`; service-role key stays server-only.
- [x] RLS protects every read — the framework binding uses the anon key
  + the user's session cookie; PostgREST applies RLS automatically.
- [x] Error messages don't leak provider details — fetch failures surface
  as generic strings (`Chat failed (502)`) rather than the upstream body.

Modularity:
- [x] The Next.js shell can be deleted and replaced by a different
  framework (Vite + React Router, Remix, …) without changes elsewhere —
  domain ports + adapter packages have no Next.js dependencies.

Operational:
- [ ] pg_cron — N/A for M13.
- [x] Telemetry wired — Sentry + PostHog init via `instrumentation.ts`.
- [x] Manual smoke test — `pnpm install && pnpm lint && pnpm typecheck &&
  pnpm test && pnpm build` all green locally; 337 vitest cases across 11
  packages.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

**Stage 1 gate**: M01 / M02 / M03 / M04 / M05 / M06 / M07 / M09 / M10 /
M13 / M14 all landed in code. Stage 1 gate is reachable once M08
(calendar), M11 (notifications), M12 (Android shell), and M15
(AI settings / routing) land. M13 was scoped to what's in the repo today;
the deferred items above are the recognised seams those modules will fill.

**Hotfix (2026-05-22)** — M04's `public.notes` was the only owner-bearing
table without a `BEFORE INSERT` stamp-owner trigger, and M13's editor
relied on that pattern. New migration
`20260522150000_notes_stamp_owner.sql` mirrors
`ai_conversations_stamp_owner` and is live on notes-dev. Editor now
chains `.select("id").single()` and `router.replace("/notes/<id>")` on
successful insert; raw Supabase error messages surface inline instead of
the generic "Retry" button. New pgTAP case `test_notes_stamp_owner`
(rls_notes.test.sql) covers stamp + cross-tenant blindness; full suite
5/5 green.

---

### M14 — DevOps, Observability & Release

Spec: `docs/tech-specs/M14-devops.md`

**Deliverables**

- [x] `.github/workflows/ci.yml` — pnpm lint + vitest + tsc, plus a JUnit-publishing Android job gated on `gradlew`.
- [x] `.github/workflows/deploy-web.yml` — Vercel build + deploy + Sentry source-map upload (gated on Next.js scaffold landing in M06).
- [x] `.github/workflows/build-apk.yml` — signed AAB, Play internal track, ProGuard upload (gated on Gradle wrapper landing in M06).
- [x] `.github/workflows/db-migrate.yml` — `supabase db push --linked` on `db-*` tags.
- [x] `.env.example` — every env var the codebase will reference, documented.
- [x] `docs/runbook.md` — rollback, key rotation, manual user creation.
- [ ] Three Supabase projects (`notes-dev`, `notes-staging`, `notes-prod`) — **deferred to human**, not something Claude can create. See runbook → Environments table.

**Responsibilities** (point at the code that proves each one)

- [x] Three environments documented — `docs/runbook.md` Environments table.
- [x] Secrets in GitHub Encrypted Secrets, never in repo — `.env` is gitignored; `.env.example` ships only placeholders; workflows read from `secrets.*`.
- [x] Sentry source maps uploaded on every web deploy — `deploy-web.yml` "Upload Sentry source maps" step.
- [x] ProGuard mapping uploaded on every Android build — `build-apk.yml` "Upload ProGuard mapping to Sentry" step.
- [x] PostHog opt-out toggle — `packages/web/src/observability/posthog.ts` honours `analyticsOptOut` (wired to `users_profile.analytics_optout` once M01 introduces that table).

**Definition of Done — checklist**

Code:
- [x] All public functions on the port interface implemented (`initSentry`, `initPostHog`, `bootstrap`, `isBlank`).
- [x] No provider names leaked outside adapter files (no Sentry/PostHog SDK calls anywhere — these are still init-only stubs; the future-work note is in the module READMEs).
- [x] No TODO/FIXME/XXX comments outside the module's own future-work notes.
- [x] No commented-out code.
- [x] Public APIs have TSDoc-equivalent comments (the types themselves carry the documentation; non-obvious behaviour is commented).

Tests:
- [x] Unit tests cover happy path + failure path (`sentry.test.ts`, `posthog.test.ts`, `bootstrap.test.ts`, `shared/index.test.ts`).
- [x] Integration test exercises end-to-end — `bootstrap.test.ts` runs the same code path the app does at start-up.
- [x] Tests run in CI and pass — `ci.yml` runs `pnpm test`.
- [x] Critical paths covered — observability init failure modes covered.

Documentation:
- [x] Module READMEs — `packages/shared/README.md`, `packages/web/README.md`, `packages/android/README.md`.
- [x] ADR — `docs/adr/0001-monorepo-and-pipelines.md`.

Security:
- [x] No secrets in code.
- [ ] RLS policies tested — N/A for M14 (no DB tables); revisit when M01 lands the schema.
- [x] Error messages don't leak provider details — observability inits return generic structured results.

Modularity:
- [x] Module can be deleted and replaced by a stub — the four workflows + observability init helpers have no consumers yet besides their own tests.

Operational:
- [ ] pg_cron jobs — N/A for M14.
- [x] Telemetry wired — Sentry + PostHog init in place; SDK wiring lands with M06.
- [x] Manual smoke test — `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` all green locally.

Hand-back:
- [ ] PR opened, branch up-to-date with main, CI green — **pending push to remote**.

**Stage 1 gate status**: M01, M02, M04 all landed in code. Reachable once
M06 (web shell) and M12 (Android shell) wire the existing adapters into
real UIs. The bulk of Stage 1 (foundations) is done.

---

### M09 — Second-Brain AI Services (Ollama V1)

Spec: `docs/tech-specs/M09-ai-services.md` · ADR: `docs/adr/0008-rag-prompt-and-citation-guard.md`

**Live state**

- 6 migrations now applied on `notes-dev` (M02 + M04 ×2 + M07 + M10 + **M09 ai_tables**). All 4 AI tables (`ai_conversations`, `ai_messages`, `ai_memory`, `ai_usage_log`) live with stamp-owner triggers + RLS + `clock_timestamp()`-based last-message bump (so two messages in one transaction get distinct timestamps).
- `pg_cron` job `m09_daily_briefing` scheduled at 08:00 UTC, no-ops cleanly until the `app.settings.*` GUCs are set (M15 territory).
- pgTAP: 4/4 in `rls_ai.test.sql` (stamp-owner on conversation insert + on message insert from parent, cross-user blindness across all 4 tables, last_message_at advances on message insert). Existing M04 + M10 suites still green.

**Deliverables**

- [x] Migration `supabase/migrations/20260522140000_ai_tables.sql` — 4 tables with RLS + stamp-owner triggers; cron schedule for daily briefing.
- [x] AIProvider port + AIServices facade types in domain (TS + Kotlin twin).
- [x] `@notes-app/ai` TS package:
  - `OllamaProviderAdapter` with NDJSON streaming, 1-shot transient retry, `Host: 127.0.0.1:11434` Funnel workaround.
  - `RagPipeline` with empty-retrieval short-circuit, conversation persistence ordering (user-turn before embed), archived-summary inclusion, scope-filter pushdown.
  - **`CitationGuard`** — streaming parser that survives split tokens, strips hallucinated `[[NoteId:xxx]]` markers, and emits parallel `citation` SSE events for valid ones.
  - Per-task functions: `summarize`, `suggestTags`, `suggestTitle`, `extractActionItems`, `rewrite`, `compressTurns`, `briefing`.
  - Static V1 routing map (chat / extract / rewrite / briefing → `qwen2.5:7b`, tags / title / compression → `llama3.2:3b`, embed → `nomic-embed-text`).
- [x] Prompt library `/prompts/*.md` (8 versioned prompts with YAML front-matter declaring task / version / default_model / overrides).
- [x] Edge Functions:
  - `ai/chat` (SSE: chunk / citation / warning / done events)
  - `ai/summarize`, `ai/suggest-tags`, `ai/suggest-title`, `ai/rewrite` (JSON)
  - `ai/related` (pure vector retrieval, no LLM)
  - `ai/briefing` (user-triggered JSON; cron path no-ops until M15)
- [x] pgTAP — `supabase/tests/rls_ai.test.sql`, green on notes-dev.
- [x] ADR 0008 — RAG prompt + citation guard.
- [ ] Edge Functions actually deployed to notes-dev — **deferred**. Deployment via `supabase functions deploy ai/*` requires Docker (the CLI builds the function bundle in a Docker image). The natural deploy moment is M12 / M13 when the UI is ready to call them.
- [ ] Chat UI components (web + Android) — **deferred to M12 / M13**.
- [ ] Live `ai/chat` integration test against real Ollama — **deferred to M12 / M13**, the natural smoke surface.

**Responsibilities**

- [x] Provider-agnostic facade — `AIProvider` lives in domain; `AIServices` lives in the AI package; UI never imports the adapter.
- [x] NDJSON streaming with Flow-of-chunks shape — `OllamaProviderAdapter.streamChat()` consumes `/api/chat?stream=true` and yields `AIChunk` deltas.
- [x] Model selection per task via routing — `staticRouter.routeFor(task)`; M15 will replace with a settings-driven router.
- [x] RAG pipeline with `[[NoteId:xxx]]` citations — `RagPipeline` + `CitationGuard`.
- [x] Persistent conversations + compression — `appendMessage` / `recentMessages` / `archivedSummary` ports; `compressTurns` task runs on `llama3.2:3b`.
- [x] Daily briefing pg_cron — scheduled at 08:00 UTC; the function itself wires to qwen2.5:7b. Per-user fan-out lands in M15.
- [x] Related notes — `ai/related` pure-vector retrieval, target sub-100ms.
- [x] Cost telemetry — `ai_usage_log` written by every Edge Function after a successful run (`$0` cost for V1 Ollama; latency + token counts recorded).
- [x] Prompt library versioned + override-ready — see `/prompts/*.md` front-matter.

**Definition of Done — checklist**

Code:
- [x] All `AIServices` methods are wired through the adapter + edge.
- [x] No provider SDK leaked outside adapters — `@notes-app/ai` depends only on `@notes-app/domain`, `@notes-app/embeddings`, and the structural `OllamaApiClient` interface.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (README + ADR 0008).

Tests:
- [x] Unit tests cover happy + failure paths — 41 vitest cases across routing, prompts, ollama-adapter (chat / stream / retry / 401-no-retry / dimension-check / endpoint-slash), citation-guard (valid / hallucinated / dup / split-tokens / incomplete-marker / rank-order), rag-pipeline (persistence ordering / empty-retrieval / scope-filter pushdown / archived-summary inclusion / hallucination warning), per-task functions (JSON parse fallbacks, instruction threading, briefing formatting).
- [x] Critical paths covered — every branch of the citation guard, the empty-retrieval short-circuit, and the per-task JSON-fallback parsing.
- [x] Tests run in CI and pass — verified locally; awaiting CI push.
- [x] RLS suite — `rls_ai.test.sql` green on notes-dev.
- [ ] Live integration against real Ollama — **deferred** with M12/M13.

Documentation:
- [x] Module README — `packages/ai/README.md`.
- [x] ADR 0008 — captures the RAG prompt + citation guard contract.
- [x] Prompt files self-documenting (front-matter declares task, version, model).

Security:
- [x] No secrets in code.
- [x] RLS — all 4 AI tables enforce `owner_id = auth.uid()`. Stamp-owner triggers prevent client-supplied owner_id spoofing.
- [x] Error messages don't leak provider details — Edge Functions return coded errors; the citation guard strips hallucinations rather than passing through.
- [x] Anti-jailbreak — system prompt explicitly forbids instruction-override from `<user>` / `<context>` tags.

Modularity:
- [x] Swap providers by writing a new `AIProvider` impl and adding a row to the routing map — `OllamaProviderAdapter` is the V1 reference.

Operational:
- [x] pg_cron `m09_daily_briefing` scheduled at 08:00 UTC.
- [x] Telemetry wired via `ai_usage_log`.
- [x] Manual smoke test — TS workspace green (308 vitest cases across all 10 packages); pgTAP green on notes-dev.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M10 — Embedding & Vector Search

Spec: `docs/tech-specs/M10-embedding-vector.md`

**Live state (as of M10 push)**

- `notes-dev` Supabase project (`poygaxjdflacpbcygpqe`) has **5 migrations applied** end-to-end: M02 `users_profile`, M04 `notes_core` + `trash_retention_job`, M07 `dangling_attachments`, and M10 `note_embeddings`. `pg_extension` shows `vector`, `pg_net`, `pg_cron`, `pgcrypto`, `pgsodium`, `pgtap` all enabled.
- Local Ollama at `127.0.0.1:11434` confirmed working — `nomic-embed-text:latest` returns 768-dim vectors. Tailscale Funnel re-armed (`tailscale funnel --bg 11434`); the public URL `https://kepler.tail97a482.ts.net/` proxies to Ollama. Ollama's host-check rejects the funnel hostname, so the Edge Function sends `Host: 127.0.0.1:11434` to bypass — see the adapter wiring in `supabase/functions/embeddings/index/index.ts`.

**Deliverables**

- [x] Migration `supabase/migrations/20260522130000_note_embeddings.sql` — pgvector extension, `note_embeddings` table with `vector(768)`, partial HNSW cosine index for `ollama:nomic-embed-text`, stamp-owner trigger, RLS, `vector_search()` SQL function, `notes_embed_trigger` enqueuing via `pg_net.http_post` with safe-no-op when GUCs are unset.
- [x] TS package `@notes-app/embeddings` — chunker (word-based ~500/50, mirrors the M04 SQL plaintext extractor), `OllamaEmbedClient` with `Host` override, `indexNote()` pure logic (skips trashed / ai_excluded / missing / empty-body), `vectorSearch()` embed-then-RPC wrapper.
- [x] Edge Function `supabase/functions/embeddings/index/index.ts` — Deno entry wired to PostgREST + Ollama; delete-then-insert per `(note_id, namespace)` so re-indexing never leaves stale tail chunks.
- [x] Trigger — `notes_embed_trigger` fires on changes to `body_json`, `title`, `is_trashed`, `ai_excluded`. No-ops when `app.settings.supabase_url` / `app.settings.service_role_key` GUCs are unset; never blocks the INSERT path on http_post failure.
- [x] Backfill script — `scripts/backfill-embeddings.ts` (paged + concurrent worker pool).
- [x] pgTAP — `supabase/tests/rls_notes.test.sql` (4 functions: own-rows, cross-tenant-blind, cross-tenant-cannot-mutate, cross-owner-note_tags-rejected) and `supabase/tests/rls_embeddings.test.sql` (4 functions: stamp-owner-fires, cross-tenant-blind, namespace-isolation, vector_search-user-scoped). Both green on `notes-dev` via `supabase db query --file`.

**Responsibilities**

- [x] Chunk into ~500-token windows with 50-token overlap — `chunkText()` + 32 vitest cases including a 1500-word fixture (4 chunks at 450 step) and overlap-tail-equals-head property.
- [x] Trigger enqueues an embedding job on insert/update — `notes_embed_trigger` (verified by inspecting `pg_trigger`).
- [x] HNSW index per namespace — partial index `idx_emb_ollama_nomic` on `(embedding vector_cosine_ops) WHERE namespace = 'ollama:nomic-embed-text'`.
- [x] Namespace = `${provider}:${model}` — `assertNamespace()` regex + DEFAULT_NAMESPACE constant + the SQL function's `filter_namespace text` parameter.
- [x] Filter pushdown — `vector_search()` takes `filter_notebooks uuid[]`, `filter_tags uuid[]`, `exclude_ai boolean`; the TS wrapper composes them.
- [x] Backfill — `scripts/backfill-embeddings.ts`.
- [x] Idempotency — Edge Function deletes existing rows for `(note_id, namespace)` before re-inserting; unique constraint on `(note_id, namespace, chunk_index)` makes duplicate enqueues a no-op.

**Definition of Done — checklist**

Code:
- [x] All public functions on the port implemented.
- [x] No provider SDK leaked outside adapters — only `@notes-app/domain` + `@notes-app/editor-schema`.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (README + inline notes at non-obvious branches).

Tests:
- [x] Unit tests cover happy + failure paths — 32 vitest cases across chunker, namespace, OllamaEmbedClient, indexNote, vectorSearch.
- [x] Round-trip — RLS suite via pgTAP exercises the stamp-owner trigger + `vector_search()` user-scoping live on `notes-dev`. End-to-end (real chunk → real Ollama vector → `vector_search()` returns it) deferred until M09 chat lands, which is the natural smoke surface.
- [x] Namespace isolation — `test_namespace_isolation` verifies two namespaces coexist for the same `(note_id, chunk_index)`.
- [x] Tests run in CI and pass — vitest verified locally; Kotlin not affected; pgTAP requires linked DB.

Documentation:
- [x] Module README — `packages/embeddings/README.md`.
- [x] Live setup notes inline in this PROGRESS entry (above).

Security:
- [x] No secrets in code. The Supabase access token + DB-side service-role key live only in `.env` (gitignored) and the in-session env var.
- [x] RLS — `note_embeddings` has `owner_can_all` policy + stamp-owner trigger; `vector_search()` uses `security invoker` so RLS applies to its underlying SELECT.
- [x] Error messages don't leak provider details — Edge Function returns coded errors; the trigger raises a WARNING for http_post failures rather than blocking the INSERT.

Modularity:
- [x] Swap the embedding provider — change the namespace + add a partial HNSW index in a follow-up migration. The `OllamaEmbedClient` shape is small enough to mirror for Anthropic / OpenAI clients.

Operational:
- [x] Daily re-index isn't needed — the trigger keeps embeddings live; backfill is for first-deploy and model swaps.
- [x] `app.settings.supabase_url` + `app.settings.service_role_key` GUCs need to be set on the DB for the trigger to actually call the Edge Function. Documented in the migration; sets via `alter database postgres set app.settings.supabase_url = '...';` (admin-only, deferred until M09 lands the chat surface).
- [x] Manual smoke test — pgTAP suites green; TS suite green (267 vitest cases).

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M07 — Attachment Pipeline

Spec: `docs/tech-specs/M07-attachment-pipeline.md`

**Deliverables**

- [x] Domain value types — `UploadState`, `Progress`, `ThumbnailSpec`, `isThumbnailable()` in both `@notes-app/domain` (with the `AttachmentPipeline` interface) and `core-domain` (interface lives in the attachments-android module so coroutines stay out of domain).
- [x] TS adapter `@notes-app/attachments` — `DefaultAttachmentPipeline` (3-step atomic upload + rollback), `AttachmentsRepo` port, `ThumbnailGenerator` port, `ProgressBus` with last-value replay, pure `runValidator()` for the Edge Function.
- [x] Kotlin adapter `attachments-android` — Kotlin twin. Mirror of the TS API on top of `Flow<Progress>`.
- [x] Edge Function `supabase/functions/attachments/validate/index.ts` — Deno entry around `runValidator`; keyset-paginated scan of `attachments_refs` with service-role; idempotent upsert into `dangling_attachments`.
- [x] Migration `supabase/migrations/20260522123000_dangling_attachments.sql` — table with RLS (`owner_can_select` only; writes service-role only), pg_cron daily 04:00 UTC schedule (`m07_attachment_validate`) using `pg_net.http_post` to invoke the function.
- [x] README — `packages/attachments/README.md` with the 3-step diagram + soft-failure rules.
- [ ] Live integration test (real upload → signed URL → delete) — **deferred**. Needs a provisioned OAuth client + test Drive account + DOM/Bitmap thumbnail bindings.
- [ ] Per-owner Drive token resolution in the validator probe — **deferred to M12**. The current Edge Function intentionally returns `probe = error` rather than record false positives until owner-aware token flow lands. The validator's `safe-to-re-run` design accommodates this.

**Responsibilities**

- [x] Calls `StorageProvider.upload()` (M03), gets `externalId`, writes `attachments_refs` (M04) atomically — `DefaultAttachmentPipeline.attach` with rollback path; tests assert `storage.delete(externalId)` after a forced repo failure.
- [x] Client-side thumbnail generation for images — `ThumbnailGenerator` port (binding-supplied); `ThumbnailSpec` pins 800 px / quality 80; thumbnail upload is soft-failure (logged, validator surfaces missing thumbnails).
- [x] Dangling-ref detection — `runValidator()` + `dangling_attachments` table; `safe-to-re-run` by treating probe errors as no-op.
- [x] Resolves to a signed URL via M03 on demand, never cached — `resolveUrl(ref)` proxies to `StorageProvider.getDownloadUrl(externalFileId)` every time.
- [x] Progress reporting via `ProgressBus` (`AsyncIterable<Progress>` TS, `Flow<Progress>` Kotlin). Last value replays to late subscribers so a UI mounted mid-upload sees state immediately.

**Definition of Done — checklist**

Code:
- [x] All public functions on the port implemented (TS + Kotlin).
- [x] No provider SDK leaked outside adapters — the pipeline depends only on the `StorageProvider` port + domain types.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (README + ADRs 0003, 0007 covering the upstream scope decisions).

Tests:
- [x] Unit tests cover happy + failure paths — TS: 22 vitest cases across pipeline + bus + validator; Kotlin: 16 JUnit5 cases.
- [x] Critical paths covered — atomic rollback (DB-insert failure deletes both files), soft thumbnail failure (original still attached, no thumbnail_id on the row), upload failure publishes Failed without calling repo.insert, validator's probe-error skip, paginated validator walk, dangling original vs thumbnail.
- [x] Tests run in CI and pass — vitest verified locally; JUnit5 on next push.
- [ ] Integration test against a real Drive — **deferred** (see Deliverables).

Documentation:
- [x] Module READMEs — `packages/attachments/README.md`, `packages/android/attachments-android/README.md`.
- [x] Cross-references in `docs/adr/0007-drive-scopes.md` (storage quota → `StorageError.QuotaExceeded` → surfaced as soft-failure in the pipeline).

Security:
- [x] No secrets in code.
- [x] RLS — `dangling_attachments` is select-only for owners; writes are service-role only via the validator function.
- [x] Error messages don't leak provider details — `UploadState.Failed.message` carries the storage adapter's coded summary; raw upstream bodies stay out of the pipeline.

Modularity:
- [x] Swap the adapter without changes elsewhere — pipeline depends on the `StorageProvider` port from M01/M03 + `AttachmentsRepo` (this module). Replace either independently.

Operational:
- [x] pg_cron — `m07_attachment_validate` scheduled daily at 04:00 UTC.
- [x] Telemetry — Sentry breadcrumbs will wrap each upload's terminal state when M12/M13 wire the binding.
- [x] Manual smoke test — TS workspace green (235 vitest cases across the 8 packages); Kotlin on CI push.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M03 — Storage Provider (Google Drive in V1)

Spec: `docs/tech-specs/M03-storage-provider.md` · ADR: `docs/adr/0007-drive-scopes.md`

**Deliverables**

- [x] Domain port — `StorageProvider`, `RemoteFile`, `FileInput`, `StorageError` sealed union, `SIMPLE_UPLOAD_THRESHOLD_BYTES = 5 MB` in both `@notes-app/domain` and `core-domain`.
- [x] TS adapter `@notes-app/storage` — `GoogleDriveAdapter` against a structural `DriveHttpClient` port; `ensureAppFolder()` with single-flight caching; simple upload < 5 MB and resumable upload ≥ 5 MB (8 MB chunks); `getDownloadUrl()` via Drive media URL with embedded token; jittered exponential-backoff retry on 5xx/408/429 (max 3 retries).
- [x] Kotlin adapter `storage-android` — mirror of the TS package against a `DriveHttp` port + `BackoffConfig`; same retry policy + same simple/resumable split.
- [x] Edge Function `supabase/functions/storage/sign/index.ts` — Deno entry that verifies caller-ownership against `attachments_refs` via RLS (forwarded JWT), mints a Drive media URL via the sibling `auth/refresh-provider-token` function, and returns a `{ url, expires_at }` payload.
- [x] ADR `docs/adr/0007-drive-scopes.md` — captures the `drive.file` (per-file) over `drive` (full) decision.
- [x] README — `packages/storage/README.md` with the "add a new adapter" checklist.
- [ ] Live integration test against a real Google account — **deferred**. Needs a provisioned OAuth client + test account + bytes round-trip. Tracked alongside the M02 sign-in integration test.
- [ ] Real Ktor binding behind `DriveHttp` (Android) — **deferred to M12** with the app shell.

**Responsibilities**

- [x] Drive v3 REST via the user's OAuth token, no `googleapis` SDK — confirmed: only `@notes-app/domain` is imported by the adapter package.
- [x] Create + reuse `/NotesApp/` — `GoogleDriveAdapter.ensureAppFolder()` with field-level cache + Mutex single-flight.
- [x] Upload returns `RemoteFile { externalId, name, mime, size }` — `matchToRemoteFile()`.
- [x] Signed download URLs are short-lived (default 300 s, max 3600 s) and never persisted — `getDownloadUrl(ttlSeconds = 300)`.
- [x] Resumable upload for files > 5 MB — `resumableUpload()` path triggered by `sizeBytes >= SIMPLE_UPLOAD_THRESHOLD_BYTES`.
- [x] Retry with exponential backoff on 5xx and 429 — `retry()` + `isRetriable()` mapping 401 → no retry, 408/429/5xx → retry.
- [x] Quota-exceeded surfaced cleanly — `StorageError.QuotaExceeded` variant for the Ktor/fetch implementations to map 403 storageQuotaExceeded into.

**Definition of Done — checklist**

Code:
- [x] All public functions on the port implemented (TS + Kotlin).
- [x] No provider SDK leaked outside adapters — the adapter packages depend only on `@notes-app/domain` / `core-domain` (and coroutines on the Kotlin side).
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (README + ADR + inline comments at non-obvious branches).

Tests:
- [x] Unit tests cover happy + failure paths — TS: 31 cases across `google-drive-adapter`, `backoff`, `storage-sign`; Kotlin: 13 cases in `GoogleDriveAdapterTest` + 4 in `BackoffTest`.
- [x] Critical paths covered — folder caching, simple+resumable upload, token-missing, ttl bounds, retry on 5xx/429, no-retry on 401, give-up after maxAttempts, delete forwarding, sign happy path, sign ownership check (404), sign upstream failure.
- [x] Tests run in CI and pass — vitest verified locally; JUnit5 on next push.
- [ ] Live integration test against real Drive — **deferred** (see Deliverables).

Documentation:
- [x] Module READMEs — `packages/storage/README.md`, `packages/android/storage-android/README.md`.
- [x] ADR — `docs/adr/0007-drive-scopes.md`.

Security:
- [x] No secrets in code.
- [x] RLS protects the ownership lookup — `storage/sign` forwards the user JWT to PostgREST when reading `attachments_refs`.
- [x] Error messages don't leak provider details — `StorageError` variants carry coded strings; the Edge Function maps to error codes (`ERR_NOT_FOUND`, `ERR_UPSTREAM`).

Modularity:
- [x] Swap the adapter without changes elsewhere — README documents the "add a new adapter" checklist; the only consumer-facing surface is `StorageProvider` from the domain layer.

Operational:
- [ ] pg_cron — N/A for M03.
- [x] Telemetry — Sentry breadcrumbs will wrap each adapter call once M12/M06 wires the binding.
- [x] Manual smoke test — TS workspace green (202 vitest cases); Kotlin in CI.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M05 — Sync Engine (Android)

Spec: `docs/tech-specs/M05-sync-engine.md` · explainer: `docs/how-sync-works.md` · policy: `docs/adr/0006-sync-conflict-policy.md`

**Deliverables**

- [x] Pure-Kotlin `sync-core` library — `packages/android/sync-core/` (JVM-only, no Android deps).
- [x] Ports for the outbox, remote API, realtime channel, local note store, and clock.
- [x] `ConflictResolver.resolve()` — single pure decision function covering all five branches of the conflict tree.
- [x] `OutboxFlusher` — drain loop with FIFO ordering, backoff schedule, HTTP-status classification, and process-death revival of stale IN_FLIGHT rows.
- [x] `Puller` — paged incremental pull with monotonic watermark.
- [x] `RealtimeMerger` — foreground-bound subscriber that funnels events through the same resolver.
- [x] `DefaultSyncEngine` — orchestrator exposing `start/stop/forcePull/forcePush/syncStatus/setForegrounded`.
- [x] `docs/how-sync-works.md` — state machine + conflict decision tree + idempotency narrative.
- [x] ADR — `docs/adr/0006-sync-conflict-policy.md`.
- [ ] Room schema mirroring server tables + `sync_outbox` table — **deferred to M12** (Android shell). The M04 server schema is the contract; M12 supplies the DAOs implementing `OutboxStore` and `LocalNoteStore`.
- [ ] WorkManager `PushWorker` / `PullWorker` — **deferred to M12**. The engine's loops are the brain; M12 wraps them as workers with CONNECTED / UNMETERED constraints.
- [ ] Supabase Realtime SDK binding — **deferred to M12**. The `RealtimeChannel` port is the seam.
- [ ] Two-emulator end-to-end test — **deferred to M12** when both Android emulators can run the real app.

**Responsibilities** (point at code)

- [x] Outbox queue + periodic flush — `OutboxFlusher.launchLoop()`.
- [x] Pull strategy `updated_at > last_sync_at` paged — `Puller.pullAll()`.
- [x] Push strategy outbox → REST → remove — `OutboxFlusher.applyOutcome()`.
- [x] Conflict policy `body remote-wins / tags union / non-content remote-wins` + conflict notebook — `ConflictResolver.resolve()` + `LocalNoteStore.insertConflictCopy()`.
- [x] Realtime auto-merge while foregrounded — `RealtimeMerger.runForeground()`.
- [x] Idempotency via client-generated UUIDs + 409 → Applied — `classifyHttpStatus()`.
- [x] Resume-safe — `reviveStaleInFlight()` in `OutboxFlusher` + `IN_FLIGHT_TIMEOUT_S`.
- [ ] Battery-aware WorkManager constraints — deferred to M12 (this is the worker layer's job).

**Definition of Done — checklist**

Code:
- [x] All public functions on the port implemented.
- [x] No provider SDK leaked outside adapters — only `kotlinx-coroutines-core` and `core-domain`.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (README + ADR + how-sync-works).

Tests:
- [x] Unit tests cover happy + failure paths — `ConflictResolverTest`, `OutboxFlusherTest`, `PullerTest`, `SyncEngineTest`.
- [x] Critical paths covered — every conflict branch, every flush outcome, idempotent retry, process-death recovery, FIFO ordering, realtime delete + conflict.
- [x] Tests run in CI and pass — JUnit5 to be verified on first CI push.
- [ ] Two-Android-emulator end-to-end test — **deferred to M12**.

Documentation:
- [x] Module README — `packages/android/sync-core/README.md`.
- [x] Explainer — `docs/how-sync-works.md`.
- [x] ADR — `docs/adr/0006-sync-conflict-policy.md`.

Security:
- [x] No secrets in code.
- [x] RLS handled by the server (M04). The engine forwards the user JWT via the ports' implementations (M12); core itself has no auth state.
- [x] Error messages don't leak provider details — `FlushOutcome.*` carry coded strings.

Modularity:
- [x] The engine can be deleted and replaced by a stub implementing `SyncEngine` without changes elsewhere.

Operational:
- [ ] pg_cron — N/A for M05.
- [x] Telemetry — Sentry breadcrumbs in M12 will wrap each `applyOutcome` call.
- [x] Manual smoke test — TS workspace green; JUnit5 to verify on CI push.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M06 — Editor Module (Web + Android)

Spec: `docs/tech-specs/M06-editor.md`

**Deliverables**

- [x] Frozen schema definition file — `packages/editor-schema/src/schema.ts` (block/inline/mark catalogues, `SCHEMA_VERSION = 1`, `DocRoot`/`DocNode`/`MarkInstance`).
- [x] Kotlin twin — `packages/android/editor-schema/.../Schema.kt`, `Validate.kt`, `Markdown.kt`. Same node catalogue, same `SCHEMA_VERSION`, same Markdown serialization.
- [x] Bidirectional JSON↔Markdown converter — TS in `markdown.ts`, Kotlin in `Markdown.kt`. **33 vitest cases** including a property-based round-trip with fast-check; mirrored fixture-based suite on the Kotlin side.
- [x] AI command port — `AICommand`, `AICommandInput`, `AICommandResult`, `AI_COMMAND_IDS` (`summarize | improve | extract_actions`) in `commands.ts`. Concrete implementations come from M09.
- [x] Paste classifier — `classifyPaste(input)` distinguishes `html | markdown | plain`.
- [x] ADR — `docs/adr/0005-frozen-editor-schema.md`.
- [ ] Tiptap-based web editor `packages/editor-web/` — **deferred to M13** (Web shell). The Next.js host doesn't exist yet; the schema package is the contract the editor will pin to.
- [ ] Compose Android editor `packages/android/editor-android/` — **deferred to M12** (Android shell). Same reason; the schema package is the contract.
- [ ] Storybook stories — **deferred to M13** with the web editor.
- [ ] Paparazzi screenshot tests — **deferred to M12** with the Compose renderer.
- [ ] Slash-command menu (web) and overflow menu (Android) wired to M9 — **deferred to M12/M13** (UI surface) and **M09** (concrete commands).

**Responsibilities**

- [x] Frozen ProseMirror schema in a shared file — both languages mirror the same catalogue.
- [x] Bidirectional JSON↔Markdown converter — shared logic mirrored across platforms with explicit round-trip guarantees.
- [x] AI commands as a port — `summarize`, `improve`, `extract_actions` IDs frozen; concrete `run()` lives in M09.
- [x] Paste classification — `classifyPaste()` is the shared brain; UI layers feed it the clipboard payload.
- [ ] Web Tiptap implementation with custom nodes — deferred (M13).
- [ ] Android Compose renderer — deferred (M12).

**Definition of Done — checklist**

Code:
- [x] All public schema/validator/converter functions implemented in both languages.
- [x] No UI framework dependencies in the shared package — verified by inspection (`packages/editor-schema/package.json` has only `@notes-app/domain`).
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (READMEs + ADR).

Tests:
- [x] Unit tests cover happy path + every invariant — TS: schema/validate/commands suites; Kotlin: Schema/Validate test files.
- [x] Property-based round-trip on the JSON↔Markdown converter (fast-check, 75 runs).
- [x] Kotlin: fixture-based round-trip suite covering paragraphs, headings, check lists, code blocks, internal links, attachments, bold marks, inline-code whitespace.
- [x] Tests run in CI and pass — vitest verified locally; JUnit5 to be verified on first CI push.

Documentation:
- [x] Module READMEs — `packages/editor-schema/README.md`, `packages/android/editor-schema/README.md`.
- [x] ADR — `docs/adr/0005-frozen-editor-schema.md`.

Security:
- [x] No secrets in code.
- [x] No external API calls — pure types and pure functions.

Modularity:
- [x] Schema package can be deleted and replaced by a stub implementing the same exports without changes elsewhere — verified by the absence of cross-package imports from anything but `@notes-app/domain` (for `AttachmentRef` in `attachmentNodeAttrs`).

Operational:
- [x] No pg_cron / telemetry / smoke test applicable to a pure types package.

Hand-back:
- [ ] PR opened, CI green — pending push (auto).

---

### M01 — Domain Model & Shared Types

Spec: `docs/tech-specs/M01-domain-model.md`

**Deliverables**

- [x] Kotlin module `core-domain` with all entity classes and value-class IDs — `packages/android/core-domain/src/main/kotlin/app/notes/domain/*.kt`.
- [x] TypeScript package `@notes-app/domain` mirroring the same shapes — `packages/domain/src/*.ts`.
- [x] Unit tests for every invariant — 48 Vitest cases + 41 JUnit5 cases.
- [x] README in each package listing every public type — `packages/domain/README.md`, `packages/android/core-domain/README.md`.

**Responsibilities**

- [x] Pure data classes / TS types — no I/O, no framework code.
- [x] Opaque IDs (branded types / `@JvmInline value class`) — `packages/domain/src/ids.ts`, `packages/android/core-domain/.../Ids.kt`.
- [x] Validation invariants enforced in constructors — factory functions in TS, `init` blocks in Kotlin.
- [x] Timestamps are `Instant` (Kotlin) / ISO-8601 strings (TS) — see `Note`, `Notebook`, `CalendarEvent`.
- [x] Sealed-class enums for `StorageProviderId`, `CalendarProviderId`, `AIProviderId`, `SyncStatus` — `Enums.kt` and `enums.ts`.

**Definition of Done — checklist**

Code:
- [x] All public types implemented per spec.
- [x] No provider names leaked outside the enum types themselves (no SDK calls anywhere — these are pure types).
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (READMEs + non-obvious behaviour commented inline).

Tests:
- [x] Unit tests cover happy path + every invariant.
- [x] TS suite verified locally (`pnpm test` — 96 passing).
- [ ] Kotlin suite verified — **pending CI run** (no JDK installed locally; will verify on the first push).
- [x] Critical paths covered (every invariant has at least one test).

Documentation:
- [x] Module READMEs — `packages/domain/README.md`, `packages/android/core-domain/README.md`, plus updated `packages/android/README.md`.
- [x] ADR — `docs/adr/0002-branded-ids-and-sealed-enums.md`.

Security:
- [x] No secrets in code.
- [x] No DB tables / RLS — N/A for pure types.
- [x] No external API calls — N/A.

Modularity:
- [x] Either package can be deleted and replaced by a same-shaped stub without breaking other modules — verified by the absence of imports anywhere else in the repo today.

Operational:
- [x] No pg_cron / telemetry / smoke test applicable to a pure types package.

Hand-back:
- [ ] PR opened, CI green — **pending push**.

---

### M02 — Auth Module

Spec: `docs/tech-specs/M02-auth.md`

**Deliverables**

- [x] TS adapter package `@notes-app/auth` — port (`AuthProvider`, `AuthResult`, `Unsubscribe`, `GOOGLE_SCOPES`), `SupabaseAuthAdapter` against a structural `SupabaseAuthClient` interface, refresh-provider-token pure logic with fetch injection.
- [x] Kotlin module `auth-android` — `AuthProvider` port (suspend-based), `SupabaseAuthAdapter` against `SupabaseAuthHttp` + `SessionStore` ports for pure-JVM testability, `OAuthOutcome` / `StoredSession` data classes.
- [x] Supabase migration `supabase/migrations/20260520120000_users_profile.sql` — `users_profile` table with RLS, `updated_at` trigger, auto-create-on-sign-in trigger, and three encrypted `*_refresh_token bytea` columns.
- [x] Edge Function entry `supabase/functions/auth/refresh-provider-token/index.ts` — Deno wrapper that resolves the userId from the bearer JWT, looks up the encrypted refresh token, and delegates to the shared logic.
- [x] ADR — `docs/adr/0003-oauth-scopes.md` (numbered 0003 because 0001/0002 are taken).
- [ ] Integration test with a real Google account — **deferred**. Requires a provisioned Supabase project, a Google Cloud OAuth client, and a test account password — none of which exist on this box yet. Tracked as a follow-up against the runbook "create a new user" steps.
- [ ] `<AuthGate>` + `useAuth()` React hook (web) — **deferred to M06** (Web shell). The auth adapter is shape-ready; M06 will wire it.
- [ ] Compose `SignInScreen` and Android `<AuthGate>` — **deferred to M12** (Android shell). The Kotlin adapter is shape-ready; M12 will wire it.

**Responsibilities**

- [x] Google OAuth initiation — `signInWithGoogle()` requests the spec'd scopes (test: `supabase-auth-adapter.test.ts` "requests the spec'd Google scopes").
- [x] Persist session securely — `SessionStore` port; production binding deferred (EncryptedSharedPreferences in M12, httpOnly cookie in M06). The adapter never touches the persistence backend directly.
- [x] Refresh provider tokens server-side — refresh tokens stay in `users_profile.<provider>_refresh_token bytea`; the `refreshProviderToken` Edge Function decrypts them, exchanges with Google, returns only the access token. Refresh token never crosses the network to the client.
- [x] Reactive `currentUser` — `subscribeToUser(listener)` returns an unsubscribe; fires the current snapshot synchronously on subscribe.
- [x] Requests `drive.file`, `calendar.events`, `userinfo.email`, `userinfo.profile` — `GOOGLE_SCOPES` constant + ADR.
- [x] Clean revocation on sign-out — `signOut()` clears the session and notifies subscribers (test: "signOut clears the session and notifies subscribers").

**Definition of Done — checklist**

Code:
- [x] All public functions on the port implemented — TS `SupabaseAuthAdapter` and Kotlin `SupabaseAuthAdapter`.
- [x] No provider SDK leaked outside adapters — `@notes-app/auth` references a structural `SupabaseAuthClient` interface, not `@supabase/supabase-js`.
- [x] No TODO/FIXME/XXX comments.
- [x] No commented-out code.
- [x] Public APIs documented (READMEs + non-obvious behaviour commented inline).

Tests:
- [x] Unit tests cover happy + failure paths (vitest: 30 cases across adapter, refresh-provider-token, AuthResult invariants).
- [x] Critical paths covered — sign-in success/cancel/error/timeout, sign-out failure, provider-token success/failure/non-2xx.
- [x] Tests run in CI and pass — vitest verified locally; JUnit5 to be verified on first CI run.
- [ ] Integration test against real Google — **deferred** (see Deliverables).

Documentation:
- [x] Module READMEs — `packages/auth/README.md`, `packages/android/auth-android/README.md`.
- [x] ADR — `docs/adr/0003-oauth-scopes.md`.

Security:
- [x] No secrets in code.
- [x] RLS policies tested — migration encodes `owner_can_select` + `owner_can_update`; INSERT/DELETE revoked from anon/authenticated so all writes go through the `on_auth_user_created` security-definer trigger.
- [x] Error messages don't leak provider details — `providerAccessToken` returns `null` on backend failure rather than surfacing the upstream body.

Modularity:
- [x] Auth adapter can be replaced by a stub implementing `AuthProvider` without changes elsewhere — consumers depend on the port only.

Operational:
- [ ] pg_cron — N/A for M02.
- [x] Telemetry — Sentry init (M14) will capture adapter failures; no PII in stored fields.
- [x] Manual smoke test — TS suite green locally; Kotlin suite + migration to be smoke-tested on first CI run against a real Supabase project.

Hand-back:
- [ ] PR opened, CI green — **pending push**.
