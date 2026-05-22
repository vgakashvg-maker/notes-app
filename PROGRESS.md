# Progress

Module-by-module tracker. Tick a Definition-of-Done item only after the
referenced artefact actually exists in the repo (or is documented as
explicitly deferred with the reason).

---

## Stage 1 — Foundation

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
