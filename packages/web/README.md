# @notes-app/web

The Next.js web client. M14 seeds the package with observability stubs
(Sentry, PostHog) plus a placeholder bootstrap. M06 (Editor) will introduce
the real Next.js app router pages.

## Responsibilities

- Render the web UI.
- Initialise Sentry (errors + source maps) and PostHog (anonymous product
  analytics, opt-out via `users_profile.analytics_optout`) at start-up.

## Public interface

- `src/index.ts` — `bootstrap()` wires observability and returns the app
  identity.
- `src/observability/sentry.ts` — Sentry init port.
- `src/observability/posthog.ts` — PostHog init port.

## Swapping the adapter

Sentry and PostHog are wrapped behind `initSentry()` / `initPostHog()` so they
can be replaced by alternative observability vendors without touching call
sites.
