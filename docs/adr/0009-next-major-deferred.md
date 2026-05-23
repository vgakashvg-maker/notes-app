# ADR 0009 — Defer Next.js 14 → 15 upgrade until V2

- **Status**: Accepted
- **Date**: 2026-05-23
- **Tags**: dependencies, security, web

## Context

`pnpm audit --prod` against the V1 web app (`@notes-app/web`) reports
15 advisories chained off `next@14.2.35`, including 5 marked **high**.
The two that warrant explicit reasoning here are:

- **GHSA-36qx-fr4f-26g5** — *Middleware bypass on Pages Router edge
  middleware* (high). The advisory text is specific to Pages-Router
  middleware that runs at the edge with `request.headers` mutation
  shortcuts.
- **GHSA-vfv6-92ff-j949** — *RSC cache-poisoning via cache-busting
  collisions* (low). Affects every Next.js 13.4.6 → 15.5.16.

Plus a long tail of moderate CVEs (cache poisoning, content-type
sniffing, host-header spoofing) and one transitive `postcss@8.4.31`
that Next 14 pins.

The patched line is `next >= 15.5.16`. A Next 14 → 15 upgrade is a
major-version migration that touches:

- `app/` router APIs (`searchParams` is now a Promise; `params` too)
- React 18 → React 19 peer (RSC + Server Actions semantics shift)
- Caching defaults (`fetch`, `unstable_cache`, route segment config)
- ESLint plugin + `next.config.mjs` shape

That's a non-trivial multi-file edit across every server component +
route handler + the editor / chat / search pages.

## Decision

**Stay on Next 14.2.35 for V1. Plan the v15 upgrade for V2.**

### Why this is safe for V1

1. **No edge middleware.** Our `middleware.ts` runs on the Node
   runtime by default; we don't opt into the Edge runtime and we don't
   use the `request.headers` mutation pattern GHSA-36qx-fr4f-26g5
   targets. The advisory is **not exploitable in our configuration**.
2. **No Pages Router.** The whole app is App Router. The Pages-Router
   subset of the advisories doesn't apply.
3. **No multi-tenant cache surface.** V1 is a single-user app (each
   note's RLS scopes by `owner_id`); the cache-poisoning CVEs require
   a shared response cache between users, which we don't have.
4. **No untrusted host header reflection.** We bind to a fixed host
   on Vercel + use `Origin` validation in CORS (`_shared/cors.ts`),
   not arbitrary host echo.

### What we DID fix in V1

Two safe patch-level transitive bumps via `pnpm.overrides` at the
workspace root:

```jsonc
"pnpm": {
  "overrides": {
    "postcss@<8.5.10": ">=8.5.10",  // GHSA-qx2v-qp2m-jg93 (CSS XSS)
    "esbuild@<=0.24.2": ">=0.25.0"  // GHSA-67mh-4wv8-2f99 (dev-only)
  }
}
```

Both are patch-level changes inside the version line; no API changes,
no Next.js coupling.

## Tracking

- **V2 milestone**: upgrade to `next@^15.x` + `react@^19.x` once the
  V2 design pass is underway and we have a free week to deal with
  the App Router API breaks.
- **Monitoring**: if a high/critical CVE drops that *does* affect our
  configuration (App Router, Node runtime, single-tenant), bring this
  decision back to the top of the queue.
- **Status of v14 patch backports**: track
  <https://github.com/vercel/next.js/releases> for any `14.2.x`
  security patch line; bump within the line freely.

## Re-audit (2026-05-23)

After the overrides above + Next.js documentation here, the only
remaining findings are:

- **`next@14.2.35`** — 14 advisories (5 high / 7 moderate / 2 low). All
  covered by the analysis in this ADR; deferred to V2.
- **`vite@5.4.21`** (dev-only) — 1 moderate
  (GHSA-4w7w-66w2-5vf9, *path traversal in optimized deps .map
  handling*). Vite is pulled in transitively by `vitest@2.1.9` and is
  **only exposed when running the Vite dev server**, which we don't —
  `vitest run` doesn't open the dev server's `.map` route. We can't
  apply a `>=6.4.2` override without bumping vitest to v3 (vite v6
  isn't a vitest 2 peer); the vitest v2 → v3 migration is a
  not-quite-V1 task. **Accepted risk for V1**; revisit when V2
  bumps vitest.

Everything else resolves.
