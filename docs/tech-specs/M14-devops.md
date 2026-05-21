# M14 — DevOps, Observability & Release

> **Module ID**: `M14`
> **Complexity / Recommended AI dev**: Haiku
> **Estimated duration**: 3–4 days
> **Depends on**: (nothing)

---

## Purpose

GitHub Actions pipelines, environment management, Sentry, PostHog, and Play Store release wiring. The 'unglamorous but mandatory' module.

---

## Public Interface (the port)

```kotlin
// .github/workflows/
//   ci.yml         — lint + test on every push
//   deploy-web.yml — Vercel deploy on main
//   build-apk.yml  — signed AAB to Play internal track
//   db-migrate.yml — supabase db push on tag
```

---

## Responsibilities

- Three environments: dev (local), staging (separate Supabase project), prod.
- Secrets in GitHub Encrypted Secrets and Vercel/Supabase env config (never in repo).
- Sentry source maps uploaded on every web deploy; ProGuard mapping uploaded on every Android build.
- PostHog: anonymous product analytics; opt-out toggle in settings.

---

## Deliverables

- All four pipelines green on a sample PR.
- Runbook `docs/runbook.md`: How to roll back, How to rotate keys, How to add a new user.
- Three Supabase projects: notes-dev, notes-staging, notes-prod.

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
You are implementing module M14 (DevOps & Release) of the Evernote-like notes
app. Read `tech-specs/M14-devops.md` before starting.

Prerequisites: a GitHub repo exists, the human has created Supabase, Vercel,
and Play Console accounts.

Your job:
  1. `.github/workflows/ci.yml`:
       - On push/PR to main: pnpm install, lint (eslint), test (vitest,
         JUnit for Kotlin), type-check (tsc --noEmit).
       - Cache pnpm and gradle.
  2. `.github/workflows/deploy-web.yml`:
       - On push to main: build Next.js, deploy to Vercel production.
       - Upload Sentry source maps via @sentry/cli.
  3. `.github/workflows/build-apk.yml`:
       - On tag v*: build signed AAB, upload to Play internal track.
       - Use Android Gradle Plugin's release signing via keystore stored as
         a GitHub Encrypted Secret.
       - Upload ProGuard mappings to Sentry.
  4. `.github/workflows/db-migrate.yml`:
       - On tag db-*: run `supabase db push --linked` against prod.
       - Requires SUPABASE_ACCESS_TOKEN secret.
  5. Environment file templates:
       .env.example with all variables documented (do not commit real values).
  6. Sentry: init in both web and Android with separate DSNs.
  7. PostHog: init with opt-out check from users_profile.analytics_optout.
  8. Write `docs/runbook.md` with concrete commands for:
       - Rolling back a web deploy: `vercel rollback`
       - Rolling back an Android release: in Play Console UI
       - Rotating Anthropic key, Google client secret: explicit steps
       - Creating a new user in V1 (since signup may be locked): SQL command.

Tests:
  - Push a tiny PR; all four workflows must show green on the first try.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.14
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
