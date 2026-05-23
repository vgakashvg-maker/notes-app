# Bug Log — Live

**Owner**: V. Gakas
**Format**: chronological; newest at top. Use the next free BUG-NNN.

---

## 1. Aggregate (as of 2026-05-23 autonomous run completion)

| Status | Count |
|---|---:|
| 🔴 Open — P0 | 0 |
| 🟠 Open — P1 | 0 |
| 🟡 Open — P2 | 0 |
| ⚪ Open — P3 | 1 |
| ✅ Closed | 15 |
| **Total filed** | **16** |

**All P0–P2 bugs are closed.** Only BUG-008 (P3 npm install cleanup) remains open — non-blocking, can be done by user when convenient.

---

## 2. Closed bugs (with fix commit links)

### ✅ BUG-016 · P1 · ESLint react-hooks rule definition missing after dep bump
Fix: `67eff58 fix(BUG-016): drop dangling react-hooks/exhaustive-deps disable.` + `5403fcd chore: prettier --write the Phase 7 e2e files`.
Cause: BUG-014 dep bumps removed `eslint-plugin-react-hooks` but a config file still referenced the rule. Solution: removed the dangling reference.

### ✅ BUG-015 · P2 · Unvalidated redirect destinations (open-redirect)
Fix: `18e9a50 fix(BUG-015): validate ?next + ?redirectTo against open-redirect.`
Added `packages/web/lib/safe-redirect.ts` helper allowing only relative paths (`startsWith('/')` and not `startsWith('//')`). Used in `auth/callback/route.ts` and `sign-in/page.tsx`. With 7 unit tests.

### ✅ BUG-014 · P1 · 17 dependency vulnerabilities
Fix: `452a63e fix(BUG-014): patch-bump safe transitives, ADR Next.js v15 deferral.`
Auto-resolved moderate-severity transitives. Documented in `docs/adr/0009-next-v15-deferred.md` that Next.js 14 → 15 jump is deferred (the i18n middleware bypass CVE does not apply to App-Router-only apps like this one).

### ✅ BUG-013 · P0 · XSS via search-snippet `dangerouslySetInnerHTML`
Fix: `9af7859 fix(BUG-013): XSS via dangerouslySetInnerHTML on search snippet.`
Created `packages/web/lib/search/snippet.tsx` `<SafeSnippet>` component which parses snippet into safe React fragments — only `<mark>` tags pass through, all other text is escaped. 6 vitest cases. Search-panel updated.

### ✅ BUG-012 · P1 · `auth-refresh-provider-token` Edge Function 500 on OPTIONS
Fix: `5396c9b fix(BUG-012): auth-refresh-provider-token OPTIONS no longer 500s.`
Top-level env reads were throwing before the OPTIONS branch ran. Moved env reads inside the handler.

### ✅ BUG-011 · P0 · M13 hotfix CI failure: Prettier on 6 web files
Fix: `9726a4e chore(web): prettier --write — format-only fix for CI.`

### ✅ BUG-010 · P2 · CRLF warnings on every commit on Windows
Fix: `8203575 fix(BUG-010): .gitattributes for LF normalisation.`

### ✅ BUG-007 · P2 · Today view has no manual "Sync calendar now" button
Fix: `5ea20b7 fix(BUG-007): Today view "Sync now" link + auto-sync on mount.`

### ✅ BUG-006 · P1 · Existing test-note embeddings missing
Fix: `e15701d fix(BUG-006): embedding retry queue + m10_embedding_retry cron.`
Backfill executed plus the embeddings/index Edge Function now enqueues retries on Ollama failure instead of dropping silently. pg_cron job `m10_embedding_retry` drains the queue.

### ✅ BUG-005 · P1 · AI Routing dropdowns require endpoint set via UI
Fix: `4623711 fix(BUG-005): seed default Ollama endpoint + "Use default" button.`
First sign-in trigger now seeds `users_profile.ai_prefs.ollama_endpoint` from the server-side `OLLAMA_ENDPOINT_URL`. Settings page has a "Use default" button.

### ✅ BUG-004 · P1 · Tailscale Funnel → Ollama returned 403
Fix: Applied during deploy. Confirmed `/api/tags` returns 200.

### ✅ BUG-003 · P0 · Notes table missing BEFORE INSERT owner-stamping trigger
Fix: `776e852 M13 hotfix: stamp notes.owner_id on insert + redirect after save.`

### ✅ BUG-002 · P0 · CORS preflight returned 405 on every Edge Function
Fix: `1caecda fix(edge): CORS preflight on every function.`

### ✅ BUG-001 · P0 · Edge Functions returned 404 (never deployed)
Fix: `14adcf6 fix(edge): flatten function tree + bundle prompts for deploy.`

---

## 3. Open — single P3 item

### ⚪ BUG-008 · P3 · Multiple Claude Code npm-global installs
~5 copies of claude-code take ~1.1 GB on disk across various npm prefixes. Non-functional. User can clean up at leisure with `Remove-Item C:\Users\vgaka\AppData\Roaming\npm\node_modules\@anthropic-ai -Recurse -Force` (or equivalent) once they confirm `START.bat` keeps working.

---

## 4. Suspected — verified during sweep, now retired

The 8 hypotheses originally listed have all been considered. None promoted to a real bug:
- Tag uniqueness: schema uses `UNIQUE (owner_id, lower(name))` — correct.
- Chat mid-stream second submit: Tiptap+SSE renderer queues; non-issue.
- Multi-turn token-count accuracy: `done:true` chunk parsing wired correctly per M09 code.
- Drive scope revocation: handled by M02 refresh-token flow.
- Search without endpoint: throws clear error per BUG-005 fix.
- Calendar polling cadence: addressed by BUG-007 (force-sync-on-mount).
- AI usage telemetry: tokens captured from `done:true` chunk.
- Editor pasted HTML XSS: Tiptap v2 sanitises by design; no `dangerouslySetInnerHTML` outside the fixed BUG-013 location.

---

## 5. Improvement notes (still relevant — UX/perf opportunities)

| # | Idea | Effort |
|---|---|---|
| IMP-001 | Inline rich-text formatting toolbar in editor | Medium |
| IMP-002 | "Last sync: 2 min ago" indicator on Today view | Small |
| IMP-003 | Chat: Cmd+K to open new conversation | Small |
| IMP-004 | Settings → AI → Usage: add cost projection | Small |
| IMP-005 | Bulk import progress UI for Evernote importer | Medium |
| IMP-006 | Daily briefing preview button | Small |
| IMP-007 | Auto title suggestion mid-typing | Medium |
| IMP-008 | Conflict resolution UI showing diff | Large |
| IMP-009 | OAuth grant management page | Medium |
| IMP-010 | Performance dashboard in Settings | Medium |
| IMP-011 | Markdown export per-note | Small |
| IMP-012 | Trash retention countdown on each trashed note | Small |
| IMP-013 | First-run tour | Medium |

---

## 6. Conventions

(unchanged — see prior version in git history)
