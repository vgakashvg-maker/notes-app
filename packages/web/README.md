# @notes-app/web

Next.js 14 App Router web client.

## Responsibilities

- Renders the web UI (Today / Notes / Editor / Search / Chat / Settings).
- Hosts the framework binding to Supabase: middleware-driven auth gate,
  server-component reads via `@supabase/ssr`, browser-side mutations + OAuth
  redirect.
- Streams chat answers from the M09 `ai/chat` Edge Function over SSE,
  rendering `[[NoteId:UUID]]` markers as in-app links.
- Initialises Sentry + PostHog at start-up via Next.js's `instrumentation.ts`
  hook (the underlying stubs live in `src/observability/`).

## Public interface

- `app/layout.tsx` — composition root; mounts `<ThemeProvider>` + `<AppShell>`.
- `middleware.ts` — refreshes the Supabase session cookie and redirects
  unauthenticated traffic to `/sign-in`.
- `components/chat-stream.tsx` — SSE consumer (`chunk` / `citation` /
  `warning` / `done` / `error` events). Pure parser + citation splitter
  live in `lib/chat/{sse,citations}.ts` for headless unit-testing.
- `lib/supabase/{server,browser}.ts` — Supabase clients (anon key only; RLS
  does the authorization work). The broader `NotesService` port from
  `@notes-app/notes` is reserved for non-framework consumers (sync engine,
  AI services); the Next.js framework binding deliberately uses the Supabase
  client directly inside `lib/notes/queries.ts`.
- `instrumentation.ts` — Next.js boot hook; delegates to
  `src/index.ts:bootstrap()`.

## Routes

| Path           | Render        | Notes                                           |
|----------------|---------------|-------------------------------------------------|
| `/`            | RSC           | Today view (recent notes; M08 events deferred). |
| `/notes`       | RSC + Suspense| Note list.                                      |
| `/notes/[id]`  | RSC + client  | Lazy-loaded Tiptap editor (StarterKit).         |
| `/notes/new`   | client        | Same editor with empty body.                    |
| `/search`      | client        | Keyword + Semantic toggle (M10 `ai/related`).   |
| `/chat`        | client        | SSE chat via M09 `ai/chat`.                     |
| `/settings`    | client        | Theme switch; M11/M15 sections deferred.        |
| `/sign-in`     | client        | Google OAuth via `@supabase/ssr`.               |
| `/auth/callback` | route handler | Exchanges OAuth `code` for a session.         |

## Swapping the framework binding

The Next.js binding to Supabase lives in:

- `lib/supabase/server.ts` (server clients)
- `lib/supabase/browser.ts` (browser client)
- `middleware.ts` (session refresh + auth gate)
- `lib/notes/queries.ts` (PostgREST reads)
- `app/auth/callback/route.ts` (OAuth code exchange)

Swapping to a different framework means replacing these files with the
framework's equivalents. Domain-level ports (`AuthProvider`,
`NotesService`, `AIServices`, `StorageProvider`) stay intact in their
respective packages.

## Local dev

```bash
pnpm install
pnpm dev      # next dev on http://localhost:3000
pnpm build    # next build
pnpm test     # vitest (jsdom)
pnpm typecheck
```

The browser bundle reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; the server bundle additionally reads the
service-role + Sentry/PostHog vars from `.env`.
