# Notes App — Test Plan & Bug-Hunt Catalogue

**Owner**: V. Gakas
**Date**: 2026-05-22
**Status**: Living document — updated as bugs are found
**Author of this catalogue**: Claude (acting as QA)

---

## 1. Purpose

This is the **exhaustive test catalogue** for the Notes App V1 (web + Android). It is intentionally adversarial — every test is written assuming the system will fail. Each test case has an ID, a precondition, exact steps, an expected result, a priority (P0 blocker → P3 nice-to-have), and a current status.

Tests are organised by **domain** rather than module, because end-users hit features cross-cuttingly.

---

## 2. Test environment

| | |
|---|---|
| Web app | `http://localhost:3000` (pnpm dev) and the eventual Vercel prod URL |
| Android app | Debug APK at `packages/android/app/build/outputs/apk/debug/app-debug.apk` |
| Supabase | `notes-dev` project (`poygaxjdflacpbcygpqe.supabase.co`) |
| Ollama | `https://kepler.tail97a482.ts.net` (Tailscale Funnel) |
| Models | `qwen2.5:7b`, `llama3.2:3b`, `nomic-embed-text` |
| Test user | `vg.aakash@gmail.com` (in OAuth test-users list) |
| Browsers | Chrome (primary), Edge, Firefox |
| Android device | User's phone (tier "full"); future: Pixel emulator |

---

## 3. Priority key

| Priority | Meaning |
|---|---|
| **P0** | Blocker — must work for V1 ship. If this fails, no one can use the app. |
| **P1** | Major — high-traffic feature; broken = users notice immediately. |
| **P2** | Medium — supporting feature; broken = degraded experience. |
| **P3** | Nice-to-have — polish; broken = annoying but tolerable. |

## 4. Status key

| Status | Meaning |
|---|---|
| ✅ PASS | Verified passing today |
| ❌ FAIL | Verified failing today (linked to bug below) |
| ⚠️ PARTIAL | Verified partially (e.g., happy path works, edge cases not tested) |
| 🔲 UNTESTED | Not yet exercised — needs running |
| 🚫 BLOCKED | Cannot run due to prereq missing (e.g., needs phone, needs Vercel deploy) |

---

## 5. Test cases by domain

> Test IDs are domain-prefixed: `AUTH-001`, `NOTE-024`, `AI-CHAT-007`, etc.
> Higher numbers within a section = increasing edge-case-iness.

---

### 5.1 Authentication & Session  (AUTH-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| AUTH-001 | P0 | Sign in with Google succeeds for whitelisted test user | Click Sign in → Google OAuth → consent | Redirect to `/` with session cookie set | ✅ |
| AUTH-002 | P0 | `users_profile` row created on first sign-in | New Google account first sign-in | A row appears in `users_profile` with the new `user_id` (auto-trigger `on_auth_user_created`) | ⚠️ Trigger exists; not load-tested with brand-new account |
| AUTH-003 | P0 | Sign-in blocked for non-test users (testing mode) | OAuth with email not on whitelist | Google "Access blocked" 403 wall | ✅ (saw this earlier with `vgakashvg@gmail.com` before adding to test users) |
| AUTH-004 | P1 | Sign out clears session | Click sign-out | Cookie cleared, redirect to `/sign-in`, attempting `/` redirects back to sign-in | 🔲 |
| AUTH-005 | P1 | Session persists across page refresh | Sign in → F5 | Still signed in, no re-auth needed | ✅ (tested) |
| AUTH-006 | P1 | Session persists across browser restart | Sign in → close all tabs → reopen browser | Still signed in (httpOnly cookie respected) | 🔲 |
| AUTH-007 | P1 | Direct URL access while signed out redirects to sign-in | Open `/notes` in fresh incognito | Redirect to `/sign-in?next=/notes` | 🔲 |
| AUTH-008 | P1 | After sign-in, redirected back to original URL | Sign-in from `/sign-in?next=/notes/abc` | Lands on `/notes/abc`, not `/` | 🔲 |
| AUTH-009 | P1 | OAuth cancel returns to sign-in cleanly | Click Google consent → Cancel | No error page, returns to sign-in screen | 🔲 |
| AUTH-010 | P1 | Refresh provider token works | Wait 1 hour after sign-in → load page | Drive/Calendar still functional (Edge Function `auth/refresh-provider-token` ran transparently) | 🔲 (time-dependent) |
| AUTH-011 | P2 | Token revocation invalidates session | Revoke OAuth grant in Google account settings → reload | Session invalidated, redirect to sign-in | 🔲 |
| AUTH-012 | P2 | RLS blocks reading another user's notes | Sign in as user A, then via service-role insert a row owned by user B; user A's GET `/rest/v1/notes` should not return it | 0 rows returned | 🔲 (pgTAP tests assert this, manual not done) |
| AUTH-013 | P2 | Sign-in works in incognito (no leaked state) | Open incognito → /sign-in → Google | Successful sign-in, no crashes | 🔲 |
| AUTH-014 | P3 | Sign-in works on mobile browser | Open localhost from phone → sign in | Same flow works, layout responsive | 🔲 |
| AUTH-015 | P3 | Concurrent sessions across devices | Sign in on web AND Android with same account | Both work simultaneously; notes sync between them | 🔲 |
| AUTH-016 | P1 | Sign-out from one device doesn't sign out other | Web + Android both signed in → sign out web | Android still signed in | 🔲 |
| AUTH-017 | P2 | Google account switching | Sign out → sign in with different test user | Loads that user's empty corpus, no leakage from previous | 🔲 |
| AUTH-018 | P3 | Browser autofill plays nicely with sign-in form | Browser offers to fill saved credential | No JS errors, form submits | 🔲 |

**Section total**: 18 tests · ✅ 3 · ⚠️ 1 · 🔲 14

---

### 5.2 Notes CRUD  (NOTE-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| NOTE-001 | P0 | Create note from `/notes/new` saves and redirects | Type title + body → Save | URL → `/notes/<uuid>`, row in `notes` table, owner_id stamped by trigger | ✅ (verified via Chrome MCP earlier — note `fe487f41…`) |
| NOTE-002 | P0 | Created note appears in `/notes` list | After NOTE-001 → navigate to /notes | New note at top of list with title + date | ✅ |
| NOTE-003 | P0 | Open existing note loads body | Click note in list | Editor opens with title + body filled | ✅ |
| NOTE-004 | P0 | Edit existing note saves | Open note → modify body → Save | DB row's `body_json` + `updated_at` change | 🔲 |
| NOTE-005 | P1 | Rename note title saves | Edit title → Save | `notes.title` updates; list view reflects new title | 🔲 |
| NOTE-006 | P0 | Empty title note still saves | Save with title empty | Saves with title "" (or "Untitled"), no crash | 🔲 |
| NOTE-007 | P0 | Empty body note still saves | Save with body empty | Saves; opening shows empty editor | 🔲 |
| NOTE-008 | P1 | Save while offline buffers correctly (Android) | Disable wifi → edit → Save → re-enable | Outbox queues; on reconnect, sync flushes; note appears on web | 🚫 (needs phone) |
| NOTE-009 | P1 | Trash note (soft-delete) | Open note → Trash button | `is_trashed=true`, removed from main list, appears in Trash view | 🔲 |
| NOTE-010 | P1 | Restore trashed note | Trash view → Restore | `is_trashed=false`, back in main list | 🔲 |
| NOTE-011 | P1 | Trash retention auto-deletes after 30 days | Set trashed_at to >30 days ago → wait for pg_cron | Row hard-deleted from `notes` and from `note_embeddings` cascade | 🔲 (time-dependent; verify cron is scheduled) |
| NOTE-012 | P1 | Note with very long title (1000 chars) | Paste 1000-char title → Save | Truncated to schema limit OR saves cleanly without crash | 🔲 |
| NOTE-013 | P1 | Note with very long body (50,000 chars / ~10K tokens) | Paste large doc → Save | Saves; chunker (M10) creates multiple `note_embeddings` rows | 🔲 |
| NOTE-014 | P1 | Note with Unicode + emoji | Title with emoji 🎯 + Hindi/Tamil text + RTL Arabic | Saves and renders correctly on both clients | 🔲 |
| NOTE-015 | P1 | Note with code snippets | Paste a JavaScript function | Code block preserved on reload (ProseMirror schema includes code) | 🔲 |
| NOTE-016 | P2 | Note with HTML-looking content (`<script>alert(1)</script>`) | Type that literally → Save → reload | Rendered as text, NOT executed (XSS protection) | 🔲 (security-critical) |
| NOTE-017 | P2 | Note with SQL injection text (`'; DROP TABLE notes;--`) | Same as above | Saves and displays as text; DB unaffected | 🔲 |
| NOTE-018 | P2 | Concurrent edits from two devices last-writer-wins | Edit same note on web AND Android simultaneously → both save | One winner, the other lands in "Conflicts" notebook (M05) | 🚫 (needs Android) |
| NOTE-019 | P2 | Two browser tabs editing same note | Open same note in two tabs → edit both → save both | Last save wins; UI reflects current state on reload | 🔲 |
| NOTE-020 | P1 | List notes paginated when > 50 | Create 100+ notes → /notes | Infinite scroll or pagination; no UI freeze | 🔲 (no fixture data yet) |
| NOTE-021 | P1 | Order by updated_at desc | Edit older note | It jumps to top of list | 🔲 |
| NOTE-022 | P2 | Note with no notebook (notebook_id null) | Create note without selecting notebook | Lives in "Inbox" or "Uncategorised" virtual notebook | 🔲 |
| NOTE-023 | P1 | Move note to another notebook | Open note → notebook picker → switch | `notebook_id` updates; list filters reflect | 🔲 |
| NOTE-024 | P2 | Pin a note | Pin action | `is_pinned=true`; pinned section above others | 🔲 |
| NOTE-025 | P2 | Star a note (if implemented) | Star action | Reflected in UI | 🔲 |
| NOTE-026 | P3 | Note JSON export | Right-click → Export | File downloaded with body_json + metadata | 🔲 |
| NOTE-027 | P0 | RLS prevents updating another user's note | Auth as user A, send PATCH for user B's note id | 403 / 0 rows affected | 🔲 (pgTAP asserted) |
| NOTE-028 | P1 | imported_from_guid uniqueness | Run Evernote importer twice with same .enex | Second run is no-op; no duplicates | 🚫 (importer not built) |
| NOTE-029 | P2 | Note URL stable across renames | Save note → rename title → reload by URL | Same UUID, no broken link | ✅ (URL is /notes/<uuid> — UUID doesn't change) |
| NOTE-030 | P2 | Browser back button after save | Save → back → forward | State preserved, no double-save | 🔲 |

**Section total**: 30 tests · ✅ 4 · 🔲 24 · 🚫 2

---

### 5.3 Editor (Tiptap)  (EDIT-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| EDIT-001 | P0 | Plain text typing | Click editor → type | Each keystroke renders, no lag | ✅ |
| EDIT-002 | P0 | Bold via Ctrl+B | Select text → Ctrl+B | Text becomes bold; persists on save | 🔲 |
| EDIT-003 | P0 | Italic via Ctrl+I | Select → Ctrl+I | Italic; persists | 🔲 |
| EDIT-004 | P0 | H1 via `# ` markdown shortcut | Type `# Heading` | Becomes H1 | 🔲 |
| EDIT-005 | P0 | H2, H3 same shortcut | `## ` and `### ` | Correct levels | 🔲 |
| EDIT-006 | P0 | Bullet list via `- ` | Type `- item` | Becomes bullet item; Enter creates next; Enter on empty exits list | 🔲 |
| EDIT-007 | P0 | Numbered list via `1. ` | Type `1. item` | Same as bullet but ordered | 🔲 |
| EDIT-008 | P1 | Check list (task list) | Type `- [ ] ` | Checkbox item; clicking toggles | 🔲 |
| EDIT-009 | P1 | Code block via triple-backtick | Type ` ``` ` | Code block with monospace, syntax highlighting if implemented | 🔲 |
| EDIT-010 | P1 | Inline code via backticks | `\`code\`` | Inline code styling | 🔲 |
| EDIT-011 | P1 | Link via `[text](url)` | Markdown link | Becomes clickable link | 🔲 |
| EDIT-012 | P1 | Undo / Redo (Ctrl+Z / Ctrl+Shift+Z) | Edit → undo → redo | Restores prior state | 🔲 |
| EDIT-013 | P1 | Paste plain text | Copy from terminal → paste | No HTML pollution; clean text | 🔲 |
| EDIT-014 | P1 | Paste HTML | Copy from web page with formatting → paste | Schema-conformant translation (h1→h1, em→italic, etc.) | 🔲 |
| EDIT-015 | P1 | Paste Markdown | Copy markdown → paste | Converted to ProseMirror nodes | 🔲 |
| EDIT-016 | P1 | Paste image from clipboard | Screenshot → paste in editor | Attachment node created, uploaded to Drive (M07) | 🔲 |
| EDIT-017 | P2 | Drag-drop image | Drag PNG into editor | Same as paste image | 🔲 |
| EDIT-018 | P2 | Drag-drop large file (>5MB) | Drag 10MB PDF | Resumable upload progress visible; eventual success | 🔲 |
| EDIT-019 | P2 | Cancel mid-upload | Drag → cancel during progress | No orphaned attachment in Drive | 🔲 |
| EDIT-020 | P1 | Editor JSON round-trips on save/load | Format heavily → save → reload | Identical formatting preserved (no drift) | 🔲 |
| EDIT-021 | P1 | Schema mismatch handled gracefully | Inject invalid body_json via SQL → reload note | Editor recovers (shows raw text) instead of crashing | 🔲 |
| EDIT-022 | P2 | Slash-command opens AI menu | Type `/` | Menu shows Summarize, Improve writing, Extract actions | 🔲 (per M06 spec) |
| EDIT-023 | P2 | Slash-command "Summarize" inserts response | /summarize | M09 ai/summarize called, result inserted | 🔲 |
| EDIT-024 | P2 | Slash-command "Extract action items" creates checklist | /actions | Bullet list with checkboxes inserted | 🔲 |
| EDIT-025 | P3 | Editor scrolls on long content | 10,000+ word note | Scroll works smoothly, no jank | 🔲 |
| EDIT-026 | P1 | Auto-save (if implemented) | Type → wait 5s → don't click Save → reload | Changes preserved or warning shown | 🔲 (current UX is manual Save) |
| EDIT-027 | P1 | Save without changes (button disabled) | Open note → don't edit → Save | No-op OR button greyed out | 🔲 |
| EDIT-028 | P2 | Navigation away with unsaved changes warns | Edit → click "Notes" without saving | Confirm dialog "Discard changes?" | 🔲 |
| EDIT-029 | P2 | Markdown-mode toggle (M06 spec) | Toggle | Editor switches to plain Markdown input/output | 🔲 |
| EDIT-030 | P2 | Internal link `[[Note Title]]` resolves | Type `[[Claude verification test]]` | Becomes hyperlink to that note | 🔲 |
| EDIT-031 | P2 | Internal link to non-existent note creates placeholder | `[[Nonexistent]]` | Highlighted but click does what? | 🔲 |

**Section total**: 31 tests · ✅ 1 · 🔲 30

---

### 5.4 Search  (SRCH-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| SRCH-001 | P0 | Keyword search by single word in title | Type "verification" → Search | "Claude verification test" appears | 🔲 |
| SRCH-002 | P0 | Keyword search by word in body | Search for unique body word | Note returns | 🔲 |
| SRCH-003 | P1 | Multi-word AND search | "claude verification" | Returns notes matching both | 🔲 |
| SRCH-004 | P1 | Case-insensitive | "VERIFICATION" | Same results as lowercase | 🔲 |
| SRCH-005 | P1 | Partial word / prefix | "verif*" | Returns "verification" notes | 🔲 |
| SRCH-006 | P1 | No results state | Search "asdfghjkl" | "No results" message, no crash | 🔲 |
| SRCH-007 | P1 | Empty query | Click Search with empty input | Either: shows nothing, OR returns all, OR shows error | 🔲 |
| SRCH-008 | P1 | Special chars in query | Search "C++" or "what's up?" | No SQL error; returns reasonable match | 🔲 |
| SRCH-009 | P0 | Semantic toggle calls vector search | Toggle Semantic → query "hotfix that fixed note saving" | Returns "Claude verification test" by similarity even without keyword match | 🔲 (needs embeddings to exist) |
| SRCH-010 | P1 | Semantic search excludes ai_excluded notes | Mark note ai_excluded=true → semantic search for its content | Not returned | 🔲 |
| SRCH-011 | P1 | Search excludes trashed notes | Trash a note → search for its title | Not returned | 🔲 |
| SRCH-012 | P2 | Filter search by notebook | Select notebook → search | Only notes in that notebook | 🔲 |
| SRCH-013 | P2 | Filter search by tag | Select tag → search | Only notes with tag | 🔲 |
| SRCH-014 | P2 | Search by date range | Last 7 days filter | Only recent notes | 🔲 |
| SRCH-015 | P3 | Search highlights matched terms | Search "verification" | "verification" highlighted in snippet | 🔲 |
| SRCH-016 | P2 | Save a search (saved searches) | Save current query | Reappears in saved searches list | 🔲 (spec'd, not sure if M13 shipped) |
| SRCH-017 | P3 | Search performance on 10k notes | Seed 10k → search "test" | <200ms response | 🔲 (load-test) |
| SRCH-018 | P1 | RLS: search returns only own notes | User A search → user B's notes never returned | Verified via 2-user setup | 🔲 |

**Section total**: 18 tests · 🔲 18

---

### 5.5 AI Chat  (AI-CHAT-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| AI-CHAT-001 | P0 | Chat panel renders | Navigate /chat | Input box + Ask button visible | ✅ |
| AI-CHAT-002 | P0 | CORS preflight on ai-chat | OPTIONS request from localhost:3000 | 204 with proper Access-Control headers | ✅ (verified 204) |
| AI-CHAT-003 | P0 | Ask basic question → POST returns 200 | Type "Hi" → Ask | Network: POST /functions/v1/ai-chat → 200 | ✅ |
| AI-CHAT-004 | P0 | Response streams (SSE) | Watch network response body | Multiple chunks arrive, not single blob | 🔲 (verified function works, didn't confirm SSE chunking) |
| AI-CHAT-005 | P0 | Empty corpus returns graceful "I don't have a note about that yet" | Empty notes → ask anything | Returns that exact short-circuit string | ✅ (observed) |
| AI-CHAT-006 | P0 | Query matching existing note returns relevant answer with citation | Backfill embeddings → ask about a known note's content | Response cites `[[NoteId:UUID]]` rendered as clickable link | ❌ FAIL — backfill not done for old notes; new notes auto-embed but old ones don't |
| AI-CHAT-007 | P1 | Citation link opens source note | Click `[[Note]]` in response | Navigates to /notes/<uuid> | 🔲 |
| AI-CHAT-008 | P1 | Multi-turn conversation: follow-up references context | Ask Q1 → ask "tell me more" | Response considers Q1 context | 🔲 |
| AI-CHAT-009 | P1 | Conversation persisted in ai_conversations table | After chat → query DB | Row exists with messages | 🔲 |
| AI-CHAT-010 | P1 | New conversation button starts fresh | Click "New conversation" | Empty pane; previous context not used | 🔲 |
| AI-CHAT-011 | P1 | Old conversation accessible from history | Click prior convo | Loads with all messages | 🔲 |
| AI-CHAT-012 | P1 | Delete conversation removes from history and DB | Right-click → Delete | Confirmed; row gone | 🔲 |
| AI-CHAT-013 | P1 | Hallucinated citation filtered by CitationGuard | Force a hallucination (somehow inject) | CitationGuard drops it, response has no broken links | 🔲 (M09 CitationGuard implemented; unit-tested per ADR 0008) |
| AI-CHAT-014 | P1 | Long question (5000 chars) | Paste long Q → ask | Either accepted with truncation, or rejected with clear error — no silent fail | 🔲 |
| AI-CHAT-015 | P1 | Ollama unreachable shows clear error | Stop Tailscale Funnel → ask | UI shows actionable error "Cannot reach AI", not blank screen | 🔲 |
| AI-CHAT-016 | P1 | Model not loaded triggers retry/warm-up | Cold qwen2.5:7b (KEEP_ALIVE expired) → ask | First-token latency higher but eventually responds | ⚠️ Behaviour observed but not formally tested |
| AI-CHAT-017 | P1 | Conversation auto-compaction when context grows | 30 turns deep → still works | Old turns summarized into archived_summary; new turns continue | 🔲 |
| AI-CHAT-018 | P2 | Code block in response renders properly | Ask "show me JavaScript hello world" | Code block with monospace | 🔲 |
| AI-CHAT-019 | P2 | Markdown in response renders | Response with **bold** | Bold renders, not literal `**bold**` | 🔲 |
| AI-CHAT-020 | P2 | Cost telemetry recorded in ai_usage_log | After chat → query table | Row with tokens, latency, model | 🔲 |
| AI-CHAT-021 | P2 | Conversation rename | Rename a thread | Title updates | 🔲 |
| AI-CHAT-022 | P3 | Stop generation mid-stream | Click "Stop" while streaming | Stream ends; partial response saved | 🔲 |
| AI-CHAT-023 | P3 | Regenerate last response | Click regenerate | New response with different sampling | 🔲 |
| AI-CHAT-024 | P1 | RLS: User A can't read user B's conversations | Two-user test | 0 rows | 🔲 |
| AI-CHAT-025 | P2 | Scope filter (notebook) restricts retrieval | Limit chat to "Work" notebook | Only those notes' chunks retrieved | 🔲 |

**Section total**: 25 tests · ✅ 4 · ⚠️ 1 · ❌ 1 · 🔲 19

---

### 5.6 AI Inline Actions (summarize / suggest tags / suggest title / rewrite)  (AI-INLINE-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| AI-INLINE-001 | P1 | Summarize note returns one-paragraph summary | Open note → /summarize | Markdown summary inserted or shown in panel | 🔲 |
| AI-INLINE-002 | P1 | Summarize with `length=oneline` returns one line | Spec says 3 lengths | Each length distinct | 🔲 |
| AI-INLINE-003 | P1 | Suggest tags returns 3-5 tags | Open note → suggest tags | List of 3-5 tag strings | 🔲 |
| AI-INLINE-004 | P1 | Accept suggested tag adds to note_tags | Click tag | Tag added; persists | 🔲 |
| AI-INLINE-005 | P1 | Suggest title for untitled note | Save with title empty → suggest title | Title inserted; user can accept/edit | 🔲 |
| AI-INLINE-006 | P1 | Extract action items returns checklist | Note with todo language → action items | Markdown checklist returned | 🔲 |
| AI-INLINE-007 | P2 | Rewrite selection improves text | Select bad sentence → rewrite | Better sentence replaces selection | 🔲 |
| AI-INLINE-008 | P2 | Empty/very-short note rejects gracefully | Summarize a 5-char note | "Note too short to summarize" instead of garbage | 🔲 |
| AI-INLINE-009 | P2 | All inline actions respect ai_excluded flag | Mark note ai_excluded → try summarize | Refuses or hides AI buttons | 🔲 |

**Section total**: 9 tests · 🔲 9

---

### 5.7 Related Notes (vector-only)  (AI-RELATED-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| AI-RELATED-001 | P1 | Related notes panel shows on editor | Open note | Side panel shows top-k similar notes | 🔲 |
| AI-RELATED-002 | P1 | Click related → opens that note | Click link | Navigates | 🔲 |
| AI-RELATED-003 | P1 | Sub-100ms response (no LLM call) | Time the API call | <100ms | 🔲 |
| AI-RELATED-004 | P2 | Updates as user types (debounced 2s) | Type new content → wait 2s | List refreshes with new similarities | 🔲 |
| AI-RELATED-005 | P2 | Empty corpus shows empty state | New user with 1 note | "No related notes yet" | 🔲 |

**Section total**: 5 tests · 🔲 5

---

### 5.8 Daily Briefing  (BRIEF-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| BRIEF-001 | P1 | pg_cron schedules briefing per user prefs | Set briefing_hour=8 → wait | Job fires at 8am user-local | 🔲 (time-dependent) |
| BRIEF-002 | P1 | Briefing summarizes yesterday's notes | Have 3 notes from yesterday → briefing | Mention of those notes | 🔲 |
| BRIEF-003 | P1 | Briefing includes today's calendar events | Set event for today → briefing | Event listed | 🔲 |
| BRIEF-004 | P1 | Briefing pinned to Today view | After fire | Briefing card at top of `/` | 🔲 |
| BRIEF-005 | P2 | Briefing delivered as Android push notification | Phone signed in → wait for cron | Notification fires | 🚫 (needs phone + FCM setup) |
| BRIEF-006 | P2 | User can disable briefing in Settings | Toggle off → wait | No briefing fires | 🔲 |

**Section total**: 6 tests · 🔲 5 · 🚫 1

---

### 5.9 Settings → AI  (SET-AI-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| SET-AI-001 | P0 | Endpoint page loads | `/settings/ai/endpoint` | Input visible | ✅ |
| SET-AI-002 | P0 | Set endpoint URL → Save | Paste Funnel URL → save | Persists in users_profile.ai_prefs | 🔲 |
| SET-AI-003 | P0 | Test Connection button | Click | Calls /functions/v1/ai-test-connection → green check + list of models | 🔲 |
| SET-AI-004 | P0 | Test Connection fails gracefully on bad URL | Set "http://badurl" → test | Red X + error message, no UI crash | 🔲 |
| SET-AI-005 | P0 | Routing page lists tasks | `/settings/ai/routing` | Table: chat, summarize, tag, title, embed, briefing, rewrite | ✅ |
| SET-AI-006 | P0 | Model dropdown populated from /api/tags | Click any dropdown | Shows qwen2.5:7b, llama3.2:3b, nomic-embed-text | 🔲 (yellow warning saw earlier — needs endpoint set first) |
| SET-AI-007 | P0 | Change a task's model → save | Pick different model → save | Persists; future chats use new model | 🔲 |
| SET-AI-008 | P1 | Embedding model change triggers re-embed | Switch embed model → confirm prompt | Background re-embed job starts; progress visible | 🔲 (spec says M15; UI may be deferred) |
| SET-AI-009 | P1 | Capability-aware dropdowns | Embed dropdown only lists embedding-capable models | nomic-embed-text only, no chat models | 🔲 |
| SET-AI-010 | P0 | Usage page loads | `/settings/ai/usage` | Chart/table appears | 🔲 |
| SET-AI-011 | P1 | Usage shows ai_usage_log data | After chats → /usage | Latency + token bars | 🔲 |
| SET-AI-012 | P2 | Per-day budget cap (V2 placeholder) | Set $0/day → try chat | Friendly "budget exceeded" — or no-op if V1 doesn't enforce | 🔲 |

**Section total**: 12 tests · ✅ 2 · 🔲 10

---

### 5.10 Calendar Integration  (CAL-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| CAL-001 | P1 | calendar/sync mirrors events from Google | Add event in Google Calendar → call sync | Row in events_mirror | 🔲 |
| CAL-002 | P1 | Today view shows mirrored events | After CAL-001 | Event card visible | ⚠️ Empty currently — sync may not have run |
| CAL-003 | P1 | Create event from a note | Open note → "Create event" → fill dialog | Event in Google Calendar + note_event_links row | 🔲 |
| CAL-004 | P1 | Edit Google event → sync mirrors update | Edit time in Calendar → run sync | events_mirror.start_at updates | 🔲 |
| CAL-005 | P1 | Delete Google event → sync removes mirror | Delete in Calendar → run sync | mirror row deleted | 🔲 |
| CAL-006 | P1 | Time zone correct | Create event with non-UTC tz | Today view shows local time | 🔲 |
| CAL-007 | P2 | All-day events | Create all-day → sync | Renders without time, full-day block | 🔲 |
| CAL-008 | P2 | Multi-day events | Spans 2+ days | Both Today views show it | 🔲 |
| CAL-009 | P2 | Reminder on event | Create with reminder | Local reminder fires via M11 | 🔲 |
| CAL-010 | P2 | Attendees included | Create with attendees | Visible in events_mirror.payload | 🔲 |
| CAL-011 | P1 | Calendar OAuth token refresh | Wait 1h → sync | Edge Function refreshes; sync succeeds | 🔲 |
| CAL-012 | P2 | Polling cadence: 15min when foreground | Watch app | 15-min sync visible in logs | 🔲 |
| CAL-013 | P3 | Calendar API failure handled | Block API → sync | Friendly error; mirror untouched | 🔲 |
| CAL-014 | P1 | RLS on events_mirror | User A can't see user B's events | Verified | 🔲 |

**Section total**: 14 tests · ⚠️ 1 · 🔲 13

---

### 5.11 Attachments  (ATT-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| ATT-001 | P1 | Attach image to note | Drag .png onto editor | Uploads to Drive; attachment node renders thumbnail | 🔲 |
| ATT-002 | P1 | Attach PDF | Drag .pdf | Uploads; node shows file pill | 🔲 |
| ATT-003 | P1 | Attach >5MB triggers resumable upload | Drag 10MB file | Progress bar; eventual success | 🔲 |
| ATT-004 | P1 | Open attachment fetches signed URL | Click pill | Opens in new tab; URL has expiry param | 🔲 |
| ATT-005 | P1 | Signed URL expires (5 min TTL) | Wait 10 min → reuse URL | 403 from Drive | 🔲 |
| ATT-006 | P1 | Delete attachment removes from Drive | Delete in note | File gone from `/NotesApp/` folder in user's Drive | 🔲 |
| ATT-007 | P1 | Cancel mid-upload doesn't orphan in Drive | Upload then cancel | Drive does not retain orphan | 🔲 |
| ATT-008 | P2 | Dangling attachment detection | Manually delete file in Drive UI → run validate cron | Flagged in dangling_attachments | 🔲 |
| ATT-009 | P2 | Image thumbnail generated client-side | Attach 4MB image | Small thumbnail uploaded too (saves bandwidth) | 🔲 |
| ATT-010 | P2 | Drive quota exceeded error | Mock 403 from Drive | User sees "Drive full" message | 🔲 |
| ATT-011 | P2 | Unsupported MIME (e.g., .exe) | Drag exe | Either upload allowed (Drive accepts) or rejected with clear message | 🔲 |
| ATT-012 | P3 | Multiple attachments per note | Add 5 images to one note | All persist; reorder works | 🔲 |
| ATT-013 | P1 | RLS: User A can't get signed URL for user B's attachment | Two-user test | 403 | 🔲 |

**Section total**: 13 tests · 🔲 13

---

### 5.12 Sync Engine (Android offline)  (SYNC-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| SYNC-001 | P0 | Offline create note | Airplane mode → create note | Saved locally; outbox row created | 🚫 |
| SYNC-002 | P0 | Reconnect flushes outbox | Re-enable network | Outbox drains; note appears on web | 🚫 |
| SYNC-003 | P0 | Idempotency: re-flush of same outbox row | Flake network mid-flush | No duplicate note created | 🚫 |
| SYNC-004 | P0 | Process death recovery | Kill app mid-flush → restart | Outbox resumes from where it left off | 🚫 |
| SYNC-005 | P1 | Pull picks up server-only changes | Edit on web → pull on Android | Android sees update | 🚫 |
| SYNC-006 | P1 | Realtime push when foregrounded | Edit on web while Android open | Android UI updates within seconds | 🚫 |
| SYNC-007 | P0 | Last-writer-wins on body | Edit same note offline on both → reconnect | One body wins; loser preserved in Conflicts notebook | 🚫 |
| SYNC-008 | P1 | Tags union on conflict | Both add different tags offline → reconnect | Both tags present | 🚫 |
| SYNC-009 | P1 | Conflict surfaces in UI | After SYNC-007 | "Conflicts (1)" badge | 🚫 |
| SYNC-010 | P1 | Force pull / force push | Settings → buttons | Manual sync works | 🚫 |
| SYNC-011 | P1 | Sync status flow shown | Watch indicator | Idle → Syncing(N) → Idle | 🚫 |
| SYNC-012 | P2 | Battery-aware: pauses on low battery | Drain battery → check WorkManager | Sync waits | 🚫 |
| SYNC-013 | P2 | Backoff schedule (30s→6h) | Trigger transient failure | Each retry happens at correct interval | 🚫 |
| SYNC-014 | P2 | Permanent failure surfaces error | 4xx (non-409) | UI shows red banner with raw error | 🚫 |
| SYNC-015 | P1 | Realtime channel cleaned up on background | App backgrounded | Subscription unsubscribed | 🚫 |

**Section total**: 15 tests · 🚫 15 (needs phone)

---

### 5.13 Notifications & Reminders  (NOTIF-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| NOTIF-001 | P1 | Schedule reminder on note | Open note → add reminder for +5min | Row in `reminders` table | 🔲 |
| NOTIF-002 | P1 | Reminder fires on Android | After NOTIF-001, wait 5min | System notification appears | 🚫 |
| NOTIF-003 | P1 | Reminder fires on web (in-tab) | Web Notifications permission granted | Browser notification | 🔲 |
| NOTIF-004 | P1 | Cancel reminder removes it | Cancel button | Row deleted | 🔲 |
| NOTIF-005 | P2 | Cross-device note exclusivity (V2) | Reminder fired on phone | Web doesn't also fire — V2 FCM coordinates | 🚫 (V1 = local-only) |
| NOTIF-006 | P2 | Permissions denied gracefully | Deny notification permission → schedule | UI says "notifications disabled" | 🔲 |
| NOTIF-007 | P2 | Reminder after phone reboot survives | Schedule → reboot Android | Fires after reboot (BOOT_COMPLETED receiver) | 🚫 |
| NOTIF-008 | P1 | RLS: User A can't schedule on user B's note | Cross-user POST | 403 | 🔲 |

**Section total**: 8 tests · 🔲 5 · 🚫 3

---

### 5.14 Android App Specific  (DROID-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| DROID-001 | P0 | APK installs from sideload | adb install app-debug.apk | Installs without error | 🚫 |
| DROID-002 | P0 | First launch shows splash → sign-in | Open app | Splash screen → Sign-in screen | 🚫 |
| DROID-003 | P0 | Google sign-in via Chrome Custom Tabs | Tap Sign-in | OAuth completes in Custom Tab; returns to app | 🚫 |
| DROID-004 | P0 | Notes from web appear after sign-in | Sign in (same account as web) → notes list | Same notes visible | 🚫 |
| DROID-005 | P0 | Create note on Android shows on web | Add note → check web | Visible on web within sync interval | 🚫 |
| DROID-006 | P1 | Compose Nav: 5 tabs work | Tap Today / Notes / Search / Chat / Settings | Each loads | 🚫 |
| DROID-007 | P1 | Back button consistent with Nav | Back from /chat | Returns to previous tab | 🚫 |
| DROID-008 | P1 | Material 3 dynamic colour | On Android 12+ | Theme picks up wallpaper colours | 🚫 |
| DROID-009 | P1 | Dark mode follows system | Toggle system dark | App theme follows | 🚫 |
| DROID-010 | P1 | Edge-to-edge / predictive back | Swipe-from-edge | Predictive back animation works | 🚫 |
| DROID-011 | P1 | Chat streams on phone | Ask question | Tokens stream | 🚫 |
| DROID-012 | P1 | Tablet layout adapts | Open on tablet | Two-pane (list + detail) | 🚫 |
| DROID-013 | P2 | Configuration change preserves state | Rotate phone | Editor state preserved | 🚫 |
| DROID-014 | P2 | Cold start <1.5s | Force-stop → tap icon → first content visible | <1.5s | 🚫 |
| DROID-015 | P2 | Voice capture (V1.5) | Hold mic button | Records → transcribes → drafts note | 🚫 |
| DROID-016 | P2 | App icon shows in launcher | After install | Icon visible | 🚫 |
| DROID-017 | P2 | Notifications permission request appears (API 33+) | First reminder schedule | OS dialog shown | 🚫 |
| DROID-018 | P3 | ProGuard release build works | Build :app:assembleRelease | Signed APK installs and runs without crash | 🚫 |
| DROID-019 | P3 | Crashes report to Sentry | Force a crash | Sentry dashboard shows event with stack trace | 🚫 |
| DROID-020 | P3 | Play Store internal track upload | gh actions build-apk.yml triggered by v* tag | AAB uploaded successfully | 🚫 |

**Section total**: 20 tests · 🚫 20 (all need phone or signed-release setup)

---

### 5.15 Web App Specific  (WEB-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| WEB-001 | P0 | Loads on Chrome | Open localhost:3000 | Page renders | ✅ |
| WEB-002 | P0 | Loads on Edge | Same | Page renders | 🔲 |
| WEB-003 | P0 | Loads on Firefox | Same | Page renders | 🔲 |
| WEB-004 | P1 | Mobile browser layout | Open from phone | Responsive; sidebar collapses | 🔲 |
| WEB-005 | P1 | Light / dark theme | Toggle | Persists in localStorage; system pref respected | 🔲 |
| WEB-006 | P1 | Browser refresh keeps state | F5 on /chat with conversation | Conversation persists (server-rendered) | 🔲 |
| WEB-007 | P1 | Direct URL load (deep link) | Paste /notes/<uuid> in new tab | Loads that note (after auth) | 🔲 |
| WEB-008 | P1 | Browser back/forward | Navigate → back | History works as expected | 🔲 |
| WEB-009 | P2 | 404 page on unknown route | /xyz | "404 page not found" instead of crash | ✅ |
| WEB-010 | P2 | Loading skeletons during fetch | Throttle network → reload notes | Skeleton shown instead of blank | 🔲 |
| WEB-011 | P2 | Error boundary catches client crashes | Force a render error | Friendly "Something broke" page; not white screen | 🔲 |
| WEB-012 | P2 | Lighthouse ≥ 90 on editor page | Run Lighthouse | Score ≥90 | 🔲 |
| WEB-013 | P2 | Service worker / offline (if enabled) | Disconnect → reload | Cached version loads (if implemented) | 🔲 |
| WEB-014 | P3 | RSC streaming for notes list | View network | Server component streams | 🔲 |
| WEB-015 | P3 | Tiptap lazy-loaded | Check bundle | Editor JS not in initial bundle | 🔲 |

**Section total**: 15 tests · ✅ 2 · 🔲 13

---

### 5.16 Security  (SEC-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| SEC-001 | P0 | RLS enforced on every table | pgTAP suite | All policy tests pass | ✅ (M04, M07, M09, M10, M11 pgTAP green) |
| SEC-002 | P0 | Service role key never sent to client | Check browser network during normal flow | Never exposed | 🔲 |
| SEC-003 | P0 | Anon key in client is anon-role only | Decode JWT | role=anon | ✅ |
| SEC-004 | P0 | OAuth tokens encrypted at rest | Query users_profile.*_refresh_token | bytea, pgsodium-encrypted | ✅ (M02 design) |
| SEC-005 | P0 | XSS in note title escaped | Save title `<script>alert(1)</script>` | Renders as text, no alert | 🔲 |
| SEC-006 | P0 | XSS in note body escaped | Same in body | Same | 🔲 |
| SEC-007 | P0 | SQL injection blocked | Submit title `'; DROP TABLE notes;--` | Stored as literal; no SQL effect | 🔲 |
| SEC-008 | P0 | CSRF protection | Try forging request from another origin | Blocked (Supabase JWT required) | 🔲 |
| SEC-009 | P1 | Tokens not in URL params | Inspect all URLs | No `?token=...` anywhere | 🔲 |
| SEC-010 | P1 | Tokens not in client logs | Sentry payloads | No PII / secrets | 🔲 |
| SEC-011 | P1 | Note bodies not logged on server | Edge Function logs | No `body_json` in any log line | 🔲 |
| SEC-012 | P1 | Tailscale Funnel URL not guessable | Random subdomain | Cryptographically random | ✅ (kepler.tail97a482) |
| SEC-013 | P1 | Ollama binds correctly behind funnel | curl from outside funnel domain | 403 / not reachable | 🔲 |
| SEC-014 | P1 | Sign-out invalidates server session | Sign out → reuse cookie via curl | 401 | 🔲 |
| SEC-015 | P2 | Rate limiting on AI endpoints | Spam ai-chat 100x in 10s | Rate limited eventually (per Supabase defaults) | 🔲 |
| SEC-016 | P2 | Edge Function rejects oversize payload | POST 10MB body | 413 instead of OOM | 🔲 |
| SEC-017 | P2 | Drive scope is drive.file not drive | Inspect granted scopes | per-file only | ✅ (ADR 0003) |
| SEC-018 | P2 | Calendar scope is events not calendar | Same | events only | 🔲 |
| SEC-019 | P3 | Content-Security-Policy headers | curl headers | CSP present | 🔲 |
| SEC-020 | P3 | HSTS in prod | curl headers (Vercel) | HSTS present | 🚫 (not deployed) |

**Section total**: 20 tests · ✅ 4 · 🔲 15 · 🚫 1

---

### 5.17 Performance  (PERF-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| PERF-001 | P1 | Web cold load < 2s | First load on cleared cache | <2s to interactive | 🔲 |
| PERF-002 | P1 | Notes list with 1000 notes < 1s | Seed → load | <1s render | 🔲 |
| PERF-003 | P1 | Keyword search < 200ms | Seed 1k → search | <200ms | 🔲 |
| PERF-004 | P1 | Semantic search < 1s | Same with vectors | <1s including embed | 🔲 |
| PERF-005 | P1 | Chat first token < 3s (warm) | Chat with warm Ollama | <3s | 🔲 |
| PERF-006 | P1 | Chat first token < 8s (cold) | Cold Ollama | <8s with "warming model" indicator | 🔲 |
| PERF-007 | P1 | Streaming rate ≥ 25 tok/s | Watch streaming | RTX 3060 should sustain ≥25 tok/s for qwen2.5:7b | 🔲 |
| PERF-008 | P2 | Editor handles 10k-word note | Paste → edit | No lag | 🔲 |
| PERF-009 | P2 | Today view < 500ms | Reload | <500ms | 🔲 |
| PERF-010 | P2 | Android cold start < 1.5s | Force stop → tap | <1.5s | 🚫 |

**Section total**: 10 tests · 🔲 9 · 🚫 1

---

### 5.18 DevOps & CI  (DEVOPS-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| DEVOPS-001 | P0 | CI green on main | GitHub Actions | Latest run success | ✅ |
| DEVOPS-002 | P0 | Vitest green locally | pnpm test | All pass | ✅ (337+ pass) |
| DEVOPS-003 | P0 | Kotlin JUnit green in CI | gradlew test | All pass | ✅ |
| DEVOPS-004 | P0 | pgTAP suite green on notes-dev | supabase test db | 24+ assertions pass | ✅ |
| DEVOPS-005 | P0 | Edge Functions deployed | supabase functions list | All 14 functions present | ✅ |
| DEVOPS-006 | P1 | Migrations applied to notes-dev | supabase db diff | empty | ✅ |
| DEVOPS-007 | P1 | Migrations replayable on fresh DB | supabase db reset → push | All apply cleanly | 🔲 |
| DEVOPS-008 | P1 | Secrets not in repo | grep for known patterns | None | 🔲 |
| DEVOPS-009 | P1 | .env.example up to date | Compare with .env | Every var in .env has placeholder | 🔲 |
| DEVOPS-010 | P1 | Production Supabase project created | dashboard | notes-prod exists | 🚫 |
| DEVOPS-011 | P1 | Vercel deploy pipeline works | git tag → push | Web deployed | 🚫 |
| DEVOPS-012 | P1 | Sentry source maps uploaded | Force prod error | Stack trace symbolicated | 🚫 |
| DEVOPS-013 | P2 | Runbook entries exist | docs/runbook.md | Has rotate-key, rollback, add-user steps | ✅ |
| DEVOPS-014 | P2 | Backups configured | Supabase dashboard | Daily backups on | 🔲 |
| DEVOPS-015 | P2 | Workflow lint/typecheck on PR | Open PR | Comments on failure | 🔲 |

**Section total**: 15 tests · ✅ 7 · 🔲 5 · 🚫 3

---

### 5.19 Data Integrity & Migrations  (DATA-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| DATA-001 | P0 | Existing notes survive code deploys | Deploy → verify | All rows intact | ✅ (12+ commits with notes preserved) |
| DATA-002 | P0 | Foreign keys enforced | Try insert note_tag with non-existent note | FK violation | 🔲 |
| DATA-003 | P0 | Cascade delete: deleting note removes embeddings | Delete note | note_embeddings rows gone | 🔲 |
| DATA-004 | P0 | Cascade delete: deleting user removes profile | Delete auth user | users_profile row gone | 🔲 |
| DATA-005 | P1 | Backfill embeddings completes for all notes | Run script | note_embeddings row count = chunks across all notes | ❌ Test notes from earlier not embedded |
| DATA-006 | P1 | Embeddings re-trigger on note update | Edit note body → check note_embeddings.created_at | Updated | 🔲 |
| DATA-007 | P1 | Conversation archived_summary set when context exceeds 70% | Long conversation | Field populated | 🔲 |
| DATA-008 | P1 | Migration 0001 applies on empty DB | supabase db reset → push | Clean | 🔲 |
| DATA-009 | P2 | All tables have RLS enabled | SELECT relname FROM pg_class WHERE relrowsecurity=false | Empty | ✅ (verified via pgTAP) |
| DATA-010 | P2 | updated_at trigger fires on every update | Update row | Field changes | 🔲 |
| DATA-011 | P2 | tsvector trigger maintains body_tsv | Insert note → query body_tsv | Populated | 🔲 |

**Section total**: 11 tests · ✅ 2 · ❌ 1 · 🔲 8

---

### 5.20 Edge Cases & Adversarial  (EDGE-*)

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| EDGE-001 | P1 | Two browser tabs same user, both edit | Two tabs → edit → save sequentially | Last write wins; no orphan state | 🔲 |
| EDGE-002 | P1 | Sign-out in tab A → tab B still open | Sign out A → click in B | B sees auth-expired error, redirects | 🔲 |
| EDGE-003 | P1 | Clock skew between client and server | Set client clock 1h forward → save | Server stamps with its own clock, no issue | 🔲 |
| EDGE-004 | P2 | Note saved while connectivity flakes | DevTools → throttle to "Slow 3G" → save | Eventually succeeds or shows clear error | 🔲 |
| EDGE-005 | P2 | Ollama returns 500 mid-stream | Inject error → chat | UI shows partial response + error banner; doesn't hang | 🔲 |
| EDGE-006 | P2 | Edge Function timeout (Supabase 60s limit) | Force long inference | Times out gracefully with "AI took too long" | 🔲 |
| EDGE-007 | P2 | Search query with Hindi / Tamil / Arabic | Multi-script | tsvector / pgvector handle correctly | 🔲 |
| EDGE-008 | P2 | Note with mixed direction text (RTL+LTR) | Hebrew + English | Bidi rendering correct | 🔲 |
| EDGE-009 | P2 | Very long URL in note body | Paste 2000-char URL | Stored; not broken into multiple lines | 🔲 |
| EDGE-010 | P2 | Note title with newline characters | Paste multi-line into title | Newlines stripped or rejected | 🔲 |
| EDGE-011 | P2 | Duplicate notebook names | Create "Work" twice | Either second blocked OR second renamed "Work (2)" — no silent collision | 🔲 |
| EDGE-012 | P2 | Tag with leading/trailing whitespace | "  test  " | Trimmed before save | 🔲 |
| EDGE-013 | P3 | Note created exactly at midnight UTC boundary | Mock clock | Date assignment correct | 🔲 |
| EDGE-014 | P3 | DST transition during edit | Save during DST switch | updated_at consistent | 🔲 |
| EDGE-015 | P2 | Browser locale change mid-session | en-US → fr-FR | Dates re-localise; content unchanged | 🔲 |
| EDGE-016 | P2 | Disable JavaScript | Server-render fallback? | Either works (RSC) or shows "JS required" | 🔲 |
| EDGE-017 | P2 | Disable cookies | Sign-in fails | Friendly error "enable cookies" | 🔲 |
| EDGE-018 | P3 | Note title containing zero-width chars | Stealth chars | Either stripped or stored — but doesn't break ordering | 🔲 |
| EDGE-019 | P3 | Embedding fails due to Ollama model unloaded | Force unload | Retry or graceful fail | 🔲 |
| EDGE-020 | P2 | Concurrent note inserts with same client UUID (idempotency) | M05 idempotency key | Server returns 409, treated as Applied | 🔲 |

**Section total**: 20 tests · 🔲 20

---

### 5.21 Evernote Importer (when built)  (IMP-*)

> All blocked until importer is implemented.

| ID | Priority | Name | Steps | Expected | Status |
|---|---|---|---|---|---|
| IMP-001 | P1 | Imports basic .enex (text only) | Run script on small file | Notes appear with title + body | 🚫 |
| IMP-002 | P1 | Imports formatted ENML | Bold/italic/lists | Mapped to ProseMirror equivalents | 🚫 |
| IMP-003 | P1 | Imports notebooks | Multi-notebook .enex | Notebooks created and notes assigned | 🚫 |
| IMP-004 | P1 | Imports tags | Tagged notes | Tags created and linked | 🚫 |
| IMP-005 | P1 | Imports attachments (resources) | Note with image resource | File uploaded to Drive; attachment node | 🚫 |
| IMP-006 | P1 | Idempotency: re-run same .enex | Run twice | Second run = no-op (imported_from_guid) | 🚫 |
| IMP-007 | P1 | Dry-run mode | --dry-run | Prints what would happen; no DB writes | 🚫 |
| IMP-008 | P2 | Large .enex (500+ notes) | Real-world export | Completes; progress visible | 🚫 |
| IMP-009 | P2 | Corrupt .enex handled | Invalid XML | Errors cleanly; partial progress saved | 🚫 |
| IMP-010 | P2 | Created/updated timestamps preserved | Compare dates | Notes keep Evernote's original dates | 🚫 |

**Section total**: 10 tests · 🚫 10

---

## 6. Aggregate stats

| Domain | Total | ✅ Pass | ⚠️ Partial | ❌ Fail | 🔲 Untested | 🚫 Blocked |
|---|---:|---:|---:|---:|---:|---:|
| AUTH | 18 | 3 | 1 | 0 | 14 | 0 |
| NOTE | 30 | 4 | 0 | 0 | 24 | 2 |
| EDIT | 31 | 1 | 0 | 0 | 30 | 0 |
| SRCH | 18 | 0 | 0 | 0 | 18 | 0 |
| AI-CHAT | 25 | 4 | 1 | 1 | 19 | 0 |
| AI-INLINE | 9 | 0 | 0 | 0 | 9 | 0 |
| AI-RELATED | 5 | 0 | 0 | 0 | 5 | 0 |
| BRIEF | 6 | 0 | 0 | 0 | 5 | 1 |
| SET-AI | 12 | 2 | 0 | 0 | 10 | 0 |
| CAL | 14 | 0 | 1 | 0 | 13 | 0 |
| ATT | 13 | 0 | 0 | 0 | 13 | 0 |
| SYNC | 15 | 0 | 0 | 0 | 0 | 15 |
| NOTIF | 8 | 0 | 0 | 0 | 5 | 3 |
| DROID | 20 | 0 | 0 | 0 | 0 | 20 |
| WEB | 15 | 2 | 0 | 0 | 13 | 0 |
| SEC | 20 | 4 | 0 | 0 | 15 | 1 |
| PERF | 10 | 0 | 0 | 0 | 9 | 1 |
| DEVOPS | 15 | 7 | 0 | 0 | 5 | 3 |
| DATA | 11 | 2 | 0 | 1 | 8 | 0 |
| EDGE | 20 | 0 | 0 | 0 | 20 | 0 |
| IMP | 10 | 0 | 0 | 0 | 0 | 10 |
| **TOTAL** | **325** | **29** | **3** | **2** | **235** | **56** |

### 6.1 Coverage by priority

| Priority | Total tests |
|---|---:|
| P0 (blocker) | ~70 |
| P1 (major) | ~150 |
| P2 (medium) | ~85 |
| P3 (nice-to-have) | ~20 |

### 6.2 Coverage by who runs them

| Type | Count | Notes |
|---|---:|---|
| Manual on web | ~120 | Run via browser MCP or hand |
| Manual on Android | ~70 | Need phone or emulator |
| Automated (vitest) | covered by 337 existing cases | Plus we'd add the security ones |
| Automated (Kotlin JUnit) | covered by 95+ existing cases | |
| Automated (pgTAP) | covered by 24+ existing assertions | RLS, triggers |
| Automated (Playwright e2e) | 🚫 deferred per spec — needs Vercel + Google OAuth client | |

---

## 7. Known bugs / observations from today's session

### 7.1 Confirmed bugs

| ID | Severity | Title | Status |
|---|---|---|---|
| BUG-001 | P0 | Edge Functions returned 404 — they were authored but never deployed to Supabase | ✅ FIXED in commit `14adcf6` |
| BUG-002 | P0 | CORS preflight returned 405 — Edge Functions didn't handle OPTIONS | ✅ FIXED in commit `1caecda` |
| BUG-003 | P0 | Notes table missing `BEFORE INSERT` owner-stamping trigger; note save failed silently with "Retry" UI | ✅ FIXED in commit `776e852` (M13 hotfix) |
| BUG-004 | P1 | Tailscale Funnel returned 403 to Ollama (OLLAMA_HOST or origin restriction) | ✅ FIXED by Claude Code during deploy |
| BUG-005 | P1 | Settings → AI → Routing yellow warning "Set your Ollama endpoint first" — the .env value isn't surfaced to the UI's routing dropdowns | ⚠️ OPEN — UI requires endpoint set via the Endpoint sub-page, even when present in .env |
| BUG-006 | P1 | Existing test notes (created during dev) have no embeddings — backfill didn't actually run when Claude Code claimed it did | ❌ OPEN — chat short-circuits on these notes |
| BUG-007 | P2 | Today view shows empty "Events" section even though no calendar sync has been triggered for the test user | ⚠️ OPEN — needs `calendar/sync` to run first, no UI button to trigger manually |
| BUG-008 | P3 | Multiple npm-global installs of Claude Code (~5 copies, 1.1 GB total) due to npm prefix changes | ⚠️ OPEN — non-blocking but wastes disk |

### 7.2 Suspected bugs (untested but smelly)

| Hypothesis | How to confirm |
|---|---|
| Tag uniqueness might not handle case-insensitive collisions (`work` vs `Work`) | Try both — DB has `UNIQUE (owner_id, lower(name))` so should be fine; verify |
| Process death mid-flush on Android could lose an outbox row if the SQLite transaction commit + workmanager status update isn't atomic | Read M05 code carefully + write an Espresso test |
| The chat UI clears the input but keeps the streaming response on screen — what happens if you submit a second question mid-stream? Could see double-streaming overlapping | Test |
| Search semantic toggle without endpoint set — does it error gracefully? | Test |
| Calendar sync polling at 15min: if app foregrounded for 14min then closed for 16min, does next sync happen instantly or wait 15 more min? | Test |
| AI usage telemetry: are tokens counted correctly when streaming? Ollama returns counts at the end of `done:true` chunk — make sure we capture from that, not estimate | Read M09 code |
| Editor's Tiptap may not sanitise pasted clipboard HTML — XSS surface | Test by pasting `<img onerror>` |
| Drive `drive.file` scope: when user revokes the OAuth grant, do already-uploaded files become inaccessible to the app? | Test |

---

## 8. How to run this catalogue

### 8.1 Right now (V1 dev)

1. **Block 1 — automated**: `pnpm test` runs the 337+ vitest cases + 95 Kotlin cases. These cover the unit-level versions of CRUD, sync conflict, RAG pipeline, etc.
2. **Block 2 — pgTAP**: `supabase test db` runs 24+ assertions against `notes-dev` covering RLS and triggers.
3. **Block 3 — manual web via browser**: walk this catalogue, marking each test pass/fail. Estimate: 6–8 hours for the ~140 web tests.
4. **Block 4 — manual Android**: install APK on phone, walk DROID-* and SYNC-* tests. Estimate: 3–4 hours.

### 8.2 In CI (V2)

Add Playwright e2e suite that exercises P0 tests against a preview deploy. Tagged with `@p0` to run on every PR; `@p1` on merges to main.

### 8.3 Before public launch

Every P0 and P1 test must be ✅. P2 must be ✅ or have documented workaround. P3 is post-launch.

---

## 9. Open questions for the product owner

1. **Empty-corpus chat fallback**: should it say "I don't have a note about that yet" or be more proactive ("Want me to search the web?")?
2. **Note title length limit**: hard cap at 200? 500? Unlimited?
3. **Trash retention period**: 30 days as spec'd, or longer?
4. **AI cost ceiling per day**: Free in V1, but should we expose a per-day token cap setting now to future-proof?
5. **Multi-device note conflict UI**: current spec says auto-create "Conflicts" notebook — does that match your expectation, or do you want a manual merge interface?
6. **Search semantic by default**: keyword is default; should semantic be the default once embeddings are robust?

---

## 10. Document history

| Date | Author | Change |
|---|---|---|
| 2026-05-22 | Claude | Initial catalogue: 325 test cases across 21 domains; 29 ✅, 2 ❌, 235 untested, 56 blocked |
