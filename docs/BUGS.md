# Bug Log — Live

**Owner**: V. Gakas
**Format**: chronological; newest at top of "Open" sections. Use the next free BUG-NNN.
**Conventions**: See bottom.

---

## 1. Aggregate

| Status | Count |
|---|---:|
| 🔴 Open — P0 | 0 |
| 🟠 Open — P1 | 3 |
| 🟡 Open — P2 | 2 |
| ⚪ Open — P3 | 1 |
| ✅ Closed | 5 |
| **Total filed** | **11** |

---

## 2. Open bugs

> Fix order: P0 → P1 → P2 → P3.

### 🟠 BUG-012 · P1 · `auth-refresh-provider-token` Edge Function crashes on OPTIONS preflight

- **Found by**: Phase 1 API sweep · 2026-05-23
- **Symptom**: OPTIONS request to `/functions/v1/auth-refresh-provider-token` returns HTTP 500 with `sb-error-code: WORKER_ERROR`. All other 16 Edge Functions return 204 correctly.
- **Repro**: `curl -X OPTIONS https://poygaxjdflacpbcygpqe.supabase.co/functions/v1/auth-refresh-provider-token` → 500
- **Impact**: Any browser-originated POST to this function will fail CORS preflight. Means Google Drive/Calendar token refresh from web client is broken — sessions will silently lose their provider access after ~1 hour.
- **Root cause hypothesis**: The function imports a module that throws at evaluation time before the OPTIONS branch runs. Most likely a missing env var (`GOOGLE_CLIENT_SECRET` or similar) being read at top-of-file with no fallback.
- **Proposed fix**: Move env reads inside the handler, wrap top-level imports in try/catch, ensure OPTIONS returns 204 before any business logic runs. Same pattern as the other 16 functions that now work.
- **Owner**: Claude Code (will batch with other P1 fixes)
- **Status**: 🟠 open

### 🟠 BUG-007 · P2 · Today view has no "Sync calendar now" button

- **Found by**: CAL-002 visual inspection · 2026-05-22
- **Symptom**: Today view shows "Nothing on the calendar today. Sync runs via `calendar/sync`." Even after manually adding events to Google Calendar, the events_mirror table is empty until the polling cycle runs.
- **Repro**: Open `/`. No way to force a sync from the UI.
- **Impact**: User can't validate the calendar integration end-to-end without waiting up to 15 min (the polling cadence).
- **Proposed fix**: Add a small "Sync now" link in the Today header's Events section that POSTs `/functions/v1/calendar-sync` and refreshes. Also call sync once on initial Today page mount if `last_sync_at` is null.
- **Owner**: Claude Code (when instructed)
- **Status**: 🟠 open

### 🟠 BUG-006 · P1 · Existing test-note embeddings missing

- **Found by**: AI-CHAT-006 · 2026-05-22
- **Symptom**: Chat returns "I don't have a note about that yet" even for queries that should clearly match note content (e.g., "What did Claude write about the hotfix?" with a note literally titled "Claude verification test").
- **Repro**: Sign in → /chat → ask about content from any pre-existing note → empty-retrieval fallback fires.
- **Root cause**: The 2 test notes were created when Ollama was unreachable via the funnel (BUG-004 era). The embedding trigger fired, the embeddings/index Edge Function tried to call Ollama, failed silently. No retry queue. So embeddings rows were never inserted for those notes.
- **Proposed fix**: 
  1. Run the backfill script: `pnpm tsx scripts/backfill-embeddings.ts` from notes-app root.
  2. Verify `SELECT count(*) FROM note_embeddings;` > 0.
  3. Retest AI-CHAT-006.
  4. Separately: harden the embedding trigger to enqueue retries on Ollama failure instead of silently dropping (improvement, separate from this backfill).
- **Owner**: Claude Code
- **Status**: 🟠 open

### 🟠 BUG-005 · P1 · AI Routing dropdowns disabled until endpoint set via UI

- **Found by**: SET-AI-005 · 2026-05-22
- **Symptom**: `/settings/ai/routing` shows yellow warning "Set your Ollama endpoint first — model lists come from /api/tags." Even though `OLLAMA_ENDPOINT_URL` is in `.env` and the backend uses it for chat/embeddings successfully.
- **Repro**: Fresh sign-in → Settings → AI → Routing. Warning is up; dropdowns don't populate.
- **Root cause**: `.env` is for backend-only; the UI reads the per-user `users_profile.ai_prefs.ollama_endpoint` value, which is empty until the user enters it in the Endpoint sub-page.
- **Proposed fix**: On first sign-in, seed `users_profile.ai_prefs.ollama_endpoint` from a `default_endpoint` server config (read from env). Show a "Use default" button on the Endpoint page that one-clicks the env default.
- **Owner**: Claude Code
- **Status**: 🟠 open

### 🟡 BUG-009 · P2 · No manual chat-history retention test

- **Found by**: AI-CHAT-009/010/011 — not yet tested
- **Symptom**: Documented gap — we haven't verified that conversations persist across reloads or that the conversation history sidebar works.
- **Proposed fix**: Run the test, file a real bug if it breaks.
- **Owner**: me (next testing pass)
- **Status**: 🟡 open

### 🟡 BUG-010 · P2 · Build-time warning: pnpm CRLF on Windows

- **Found by**: git commit output during this session
- **Symptom**: Every commit shows warnings like `LF will be replaced by CRLF the next time Git touches it`.
- **Repro**: Any `git commit` on Windows.
- **Impact**: Cosmetic. Could cause diff noise on the next checkout.
- **Proposed fix**: Add `.gitattributes` with `* text=auto eol=lf` so all text files normalise to LF in the repo.
- **Owner**: Claude Code (one-shot)
- **Status**: 🟡 open

### ⚪ BUG-008 · P3 · Multiple Claude Code npm-global installs

- **Found by**: Disk inspection during launcher debugging · 2026-05-22
- **Symptom**: ~5 copies of `@anthropic-ai/claude-code` exist on disk across `AppData\Roaming\npm`, `AppData\Local\npm-global`, `C:\Tools\npm-global`, and the Claude desktop app's packages folder. Each is ~221MB.
- **Impact**: ~1.1 GB wasted disk; periodic confusion about which copy runs.
- **Proposed fix**: After confirming `START.bat` works reliably with the one at `$env:LOCALAPPDATA\npm-global\...`, remove the others.
- **Owner**: User (or me with explicit OK)
- **Status**: ⚪ open

---

## 3. Closed bugs

### ✅ BUG-004 · P1 · Tailscale Funnel → Ollama returned 403

- **Found by**: SET-AI test connection · 2026-05-22
- **Symptom**: `curl https://kepler.tail97a482.ts.net/api/tags` returned 403 Forbidden.
- **Root cause**: Ollama's default origin restriction rejecting Tailscale's reverse-proxied requests.
- **Fix**: Claude Code adjusted `OLLAMA_HOST` / `OLLAMA_ORIGINS` env to allow the funnel domain; service restart.
- **Verified**: 200 from funnel `/api/tags`.
- **Status**: ✅ closed

### ✅ BUG-003 · P0 · Notes table missing BEFORE INSERT owner-stamping trigger

- **Found by**: NOTE-001 with the original "Hi" test note · 2026-05-22
- **Symptom**: Save click stayed on `/notes/new` and showed a "Retry" button; Supabase `notes` table remained empty.
- **Root cause**: `public.notes` lacked the BEFORE INSERT trigger that `ai_conversations` had. The editor's `.insert().select().single()` returned no row (RLS rejected the insert because `owner_id` was null), so the redirect never fired.
- **Fix**: Commit `776e852` added migration `20260522150000_notes_stamp_owner.sql` plus pgTAP cross-tenant test; editor updated to surface raw Supabase errors inline.
- **Verified**: NOTE-001 by Claude via Chrome MCP — note `fe487f41…` saved, URL redirected, row appeared in Supabase.
- **Status**: ✅ closed

### ✅ BUG-002 · P0 · CORS preflight returned 405 on every Edge Function

- **Found by**: AI-CHAT-002 · 2026-05-22
- **Symptom**: Browser OPTIONS `https://...supabase.co/functions/v1/ai-chat` returned 405. POST blocked by browser CORS.
- **Root cause**: Edge Functions only handled POST, ignored OPTIONS.
- **Fix**: Commit `1caecda` added `_shared/cors.ts` helper and imported it from every function handler.
- **Verified**: OPTIONS → 204 with Access-Control headers.
- **Status**: ✅ closed

### ✅ BUG-001 · P0 · Edge Functions returned 404 (never deployed)

- **Found by**: AI-CHAT-003 first run · 2026-05-22
- **Symptom**: `/functions/v1/ai/chat` returned 404 across all clients.
- **Root cause**: Functions were authored under `supabase/functions/` but `supabase functions deploy` was deferred in M09's PROGRESS.
- **Fix**: Commit `14adcf6` flattened folder structure (`ai/chat` → `ai-chat`), bundled prompts for Deno, deployed all 14 functions.
- **Verified**: OPTIONS + POST both return non-404.
- **Status**: ✅ closed

### ✅ BUG-011 · P0 · M13 hotfix CI failure: Prettier on 6 web files

- **Found by**: CI run history · 2026-05-22
- **Symptom**: Two consecutive CI runs failed because `pnpm format:check` flagged 6 unformatted files committed during M13.
- **Root cause**: M13 work didn't run `prettier --write` before commit.
- **Fix**: Commit `9726a4e` ran `prettier --write` across web package.
- **Verified**: Next CI run green.
- **Status**: ✅ closed

---

## 4. Suspected / unverified (drop into 'Open' if confirmed)

- Tag uniqueness with case-insensitive collisions — `UNIQUE (owner_id, lower(name))` should handle but unverified
- Chat: submitting a second question mid-stream behaviour
- Multi-turn conversation token-count accuracy (streaming `done:true` chunk parsing)
- Drive scope revocation: do already-uploaded files stay accessible to the app?
- Search semantic toggle when endpoint not set: clear error or silent fail?
- Calendar polling cadence: does next sync wait 15 min or fire immediately when app returns to foreground?
- Editor pasted clipboard HTML XSS surface
- Note title containing zero-width Unicode characters: stored or stripped?

---

## 5. Improvement notes (not bugs — UX / perf opportunities)

| # | Idea | Effort |
|---|---|---|
| IMP-001 | Inline rich-text formatting toolbar in editor (currently markdown-shortcut only) | Medium |
| IMP-002 | "Last sync: 2 min ago" indicator on Today view | Small |
| IMP-003 | Chat: keyboard shortcut (Cmd+K) to open new conversation from anywhere | Small |
| IMP-004 | Settings → AI → Usage: add cost projection ("at this rate, $0/mo since all-local") | Small |
| IMP-005 | Bulk import progress UI for the Evernote importer (when built) | Medium |
| IMP-006 | "Daily briefing preview" button in Settings to test before scheduling | Small |
| IMP-007 | Note title autosuggestion if user is typing freeform body and title is empty | Medium |
| IMP-008 | Conflict resolution UI showing the diff instead of dumping into "Conflicts" notebook | Large |
| IMP-009 | OAuth grant management page: show what scopes are active, allow revoke | Medium |
| IMP-010 | Performance dashboard in Settings: Ollama latency, embedding queue depth | Medium |
| IMP-011 | Markdown export per-note (right-click → Export) | Small |
| IMP-012 | Trash retention countdown: "deletes in 23 days" on each trashed note | Small |
| IMP-013 | First-run tour highlighting Chat, Today, Settings | Medium |

---

## 6. Conventions

- **Bug ID format**: `BUG-001`, `BUG-002`, … Never reuse.
- **Severity** mirrors `TEST_PLAN.md` priorities: P0 (blocker) / P1 (major) / P2 (medium) / P3 (nice-to-fix).
- **Every bug must include**: found-by (test ID or scenario), symptom, repro, root-cause (if known), proposed fix, owner, status.
- **Closing a bug** requires linking the fix commit SHA + the test ID that re-runs green.
- **A failed P0 test** must produce a bug entry **immediately**, even if a fix isn't ready.
- **Improvements** (not bugs) go in section 5 with `IMP-` prefix to avoid number collisions.
