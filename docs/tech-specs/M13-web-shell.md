# M13 — Web App Shell

> **Module ID**: `M13`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 7–10 days
> **Depends on**: M01, M02, M03, M04, M06, M07, M08, M09, M10, M11, M15

---

## Purpose

Next.js application that wires the same set of ports to web-appropriate adapters. Reuses the TypeScript domain package from M1.

---

## Public Interface (the port)

```kotlin
// app/layout.tsx — composition root for providers
// AuthProvider, NotesService (Supabase JS), StorageProvider (chosen per user),
// CalendarProvider, AIServices (fetch to edge functions), NotificationProvider
```

---

## Responsibilities

- Next.js 14 App Router; React Server Components for note list pages.
- Tiptap editor with the custom schema from M6.
- Streaming chat UI for M9's chat-with-notes (SSE).
- Responsive layout — tablet-first; phone web is acceptable but Android is the primary mobile target.
- shadcn/ui + Tailwind for the design system.

---

## Deliverables

- Web app deployable to Vercel with one env file.
- Lighthouse score ≥ 90 on the main editor page.
- All screens: Today, Notes list, Editor, Search, Chat, Settings.
- Light + dark theme.

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
You are implementing module M13 (Web App Shell) of the Evernote-like notes app.
Read `tech-specs/M13-web-shell.md` before starting.

Prerequisites: M1, M2, M3, M4, M6, M7, M8, M9, M10, M11, M15 all done.

Your job:
  1. Next.js 14 App Router app in `apps/web`. TypeScript strict mode.
  2. Add shadcn/ui (the CLI: pnpm dlx shadcn-ui@latest init).
  3. Tailwind config with the same color palette as the Android theme for
     consistency. Read palette from `packages/design-tokens/`.
  4. Composition root `app/layout.tsx`: AuthProvider, ThemeProvider, QueryClient.
  5. Routes:
       /              → Today view (server-rendered list of today's events + notes)
       /notes         → Notes list (RSC + Suspense)
       /notes/[id]    → Editor (client component, Tiptap)
       /search        → Search + semantic-search toggle
       /chat          → Conversation list + active chat (SSE streaming)
       /settings/*    → Settings sections (including AI from M15)
  6. Auth gate via middleware.ts checking Supabase session cookie.
  7. Chat UI: streams SSE from ai/chat; renders tokens progressively;
     parses [[NoteId:UUID]] tokens into <a href="/notes/UUID">linked text</a>.
  8. Light/dark theme via shadcn/ui Theme provider.
  9. Lighthouse: aim ≥ 90 on the editor page; lazy-load Tiptap and AI panels.
  10. Deploy: `vercel --prod` with env vars from .env.production.

Tests:
  - Playwright: sign in → create note → search → ask AI → see citation.
  - Component tests for the chat streaming renderer (mock SSE).

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.13
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
