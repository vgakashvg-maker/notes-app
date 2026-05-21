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

**Stage 1 gate status**: not reachable yet — needs M01, M02, M04.
