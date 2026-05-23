# E2E Tests (Playwright)

Phase 7 regression suite. Tests the P0 user flows against a running
`pnpm dev` server (or a Vercel preview URL once deployed).

## Run locally

```bash
pnpm --filter @notes-app/e2e exec playwright install --with-deps chromium
pnpm --filter @notes-app/e2e exec playwright test
```

## In CI

The workflow `.github/workflows/e2e.yml` runs these tests against a
preview deployment on every PR. (Vercel preview required — TODO.)

## Tests

- `auth.spec.ts`        — AUTH-001, AUTH-005 (sign-in + persistence)
- `notes-crud.spec.ts`  — NOTE-001 to NOTE-004 (create/read/update/trash)
- `editor.spec.ts`      — EDIT-001, EDIT-002, EDIT-004 (typing, bold, headings)
- `search.spec.ts`      — SRCH-001, SRCH-002 (keyword)
- `chat.spec.ts`        — AI-CHAT-001 to 005 (CORS, stream, citations)
- `security.spec.ts`    — SEC-005 (XSS via search snippet, regression for BUG-013)
