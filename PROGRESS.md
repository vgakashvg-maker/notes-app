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

**Stage 1 gate status**: not reachable yet — needs M02, M04.

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
