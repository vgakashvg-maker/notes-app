# ADR 0001 — pnpm monorepo with per-module workspaces

Date: 2026-05-20
Status: Accepted

## Context

The architecture (§7) splits the codebase into 15 modules with strict port /
adapter boundaries. Two non-obvious choices needed pinning before any module
code lands:

1. How to organise the repository (single monorepo vs. polyrepo per module).
2. Which package manager and which CI runtime versions.

## Decision

- **One monorepo** at the repo root, managed by **pnpm workspaces** declared
  in `pnpm-workspace.yaml`. Each module that ships TypeScript code becomes a
  package under `packages/<module-name>`. The Android client is a sibling
  Gradle project under `packages/android` so the workflow paths line up.
- **Node 20 LTS** in `.nvmrc` and `actions/setup-node@v4`; **pnpm 9.12.0**
  pinned via the root `packageManager` field and `pnpm/action-setup@v4`.
- **JDK 17** (Temurin) in CI to match the AGP requirement, via
  `actions/setup-java@v4`.
- **Four GitHub Actions workflows**:
  - `ci.yml` — runs on every PR and push to `main`. Lints, type-checks,
    runs unit tests on both Node and Android (Android job gated on the Gradle
    wrapper existing so the workflow stays green until M06).
  - `deploy-web.yml` — push to `main`. Builds and deploys via the Vercel CLI,
    then uploads Sentry source maps. Job gated on `packages/web/next.config.mjs`
    existing (lands in M06) so infra-only commits don't fail the deploy.
  - `build-apk.yml` — `v*` tags. Builds a signed AAB, uploads to Play internal
    track, then uploads ProGuard mappings to Sentry. Gated on
    `packages/android/gradlew` existing.
  - `db-migrate.yml` — `db-*` tags (plus manual dispatch for staging). Runs
    `supabase db push --linked` against the linked project.

## Consequences

- Switching to per-module polyrepos later is expensive — the workspace
  cross-imports (`@notes-app/shared`) all break. We accept that cost in
  exchange for a single CI invocation per change.
- Until M06 lands, two workflows (`deploy-web.yml`, `build-apk.yml`) are
  effectively no-ops on their triggers. `if: hashFiles(...) != ''` makes that
  explicit instead of silently failing.
- Deploy steps inside `deploy-web.yml` and `build-apk.yml` are individually
  gated on secret presence so the workflows complete green in forks /
  unconfigured environments.

## Alternatives considered

- **Turborepo / Nx**: rejected for V1 — pnpm filters + a small `pnpm -r`
  command set cover the build graph we have.
- **Bazel**: rejected as overkill for a single-developer V1.
- **Polyrepo per module**: rejected — cross-module refactors (which we expect
  to do often in the first few stages) would each become coordinated multi-repo
  PRs.
