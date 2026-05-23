# Testing Phase Plan — Iteration to a Bug-Free V1

**Owner**: V. Gakas
**Status**: Active
**Updated**: 2026-05-23
**Companion documents**: `TEST_PLAN.md` (the 325-case catalogue), `BUGS.md` (the living defect log)

---

## 1. Goal

Take the V1 from "code complete" → "I'd let strangers use this." Done iteratively, not in one heroic test sprint.

**Done means**: every P0 test passes, every P1 test passes, P2 tests have known states (pass or accepted-as-deferred), P3 tests are deferred-with-reason.

---

## 2. The iteration loop

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   1. Pick the next phase (1 → 7 in order)                   │
│                                                             │
│   2. Run every test in that phase                           │
│                                                             │
│   3. Every failure → write a BUG entry in BUGS.md            │
│                       (ID, severity, repro steps, blocker?) │
│                                                             │
│   4. Fix the bugs (Claude Code does the code, CI verifies)  │
│                                                             │
│   5. Re-run the failed tests → confirm green                │
│                                                             │
│   6. If any test still fails → back to step 3               │
│       Else → exit phase, move to next                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**A phase is "done" only when every test in it is ✅. No skipping forward.**

---

## 3. The seven phases

### Phase 0 — Smoke (alive?)        |  ~30 min · automated  ·  GATE: nothing else proceeds until green

Quick verification that the stack is breathing.

| What | How |
|---|---|
| CI green on latest commit | `gh run list --workflow ci.yml --limit 1` |
| Vitest passes locally | `pnpm test` |
| Kotlin tests pass in CI | included in CI |
| pgTAP green on notes-dev | `supabase test db` |
| Edge Functions deployed | OPTIONS `ai-chat` → 204 |
| Ollama reachable | `curl funnel-url/api/tags` → 200 |
| Web app loads | `pnpm dev`, GET `/` → 200 |
| Sign-in completes | Real Google OAuth round-trip |

**Entry criteria**: code is committed and pushed.
**Exit criteria**: all 8 checks pass.
**Who runs it**: me (automated, this session).

Status: ✅ All 8 currently green.

---

### Phase 1 — Critical Path (P0)    |  ~3 hours · me-driven via browser MCP  ·  GATE: no P0 in BUGS.md

The "if these break, the product is dead" tests. Roughly 70 cases drawn from every domain.

| Domain | Tests in scope |
|---|---|
| AUTH | 001, 002, 003 |
| NOTE | 001, 002, 003, 004, 006, 007, 027 |
| EDIT | 001 |
| SRCH | 001, 002, 009 |
| AI-CHAT | 001, 002, 003, 004, 005, 006 |
| SET-AI | 001, 002, 003, 005, 006, 007, 010 |
| WEB | 001, 002, 003 |
| SEC | 001, 002, 003, 004, 005, 006, 007, 008 |
| DATA | 001, 002, 003, 004 |
| DEVOPS | 001, 002, 003, 004, 005 |

**Entry criteria**: Phase 0 green.
**Exit criteria**: zero **P0 bugs** in `BUGS.md` open. (P1+ may still be open; that's Phase 2.)
**Who runs it**: me — I drive the browser via Chrome MCP for the web tests, and read the DB for security/data tests; user only provides credentials if asked.
**Output**: every failure → new BUG entry in `BUGS.md`.

---

### Phase 2 — Core Features (P1)   |  ~6 hours · me-driven + user spot-checks  ·  GATE: no P1 in BUGS.md

The "users will hit these daily" tests. Roughly 150 cases.

| Domain | Tests in scope |
|---|---|
| AUTH | 004–017 |
| NOTE | 005, 008–023, 028 |
| EDIT | 002–020, 026–030 |
| SRCH | 003–014, 016 |
| AI-CHAT | 007–017, 024 |
| AI-INLINE | 001–006 |
| AI-RELATED | 001–005 |
| BRIEF | 001–004 |
| SET-AI | 002–011 |
| CAL | 001–006, 011, 014 |
| ATT | 001–007, 013 |
| NOTIF | 001, 003, 004, 008 |
| WEB | 004–008 |
| SEC | 009–014 |
| DATA | 005–008, 011 |

**Entry criteria**: Phase 1 fully ✅.
**Exit criteria**: zero **P1 bugs** in `BUGS.md` open. P2+ may still be open.
**Who runs it**: me for the browser/API tests; some need the user (e.g., real Google Calendar event creation needs the user's calendar) — those will be queued and run together to minimise interruptions.

---

### Phase 3 — Polish (P2/P3)        |  ~4 hours · best-effort  ·  GATE: every test has a documented status

The edge cases, performance, accessibility. P2 cases that fail get triaged: accept-as-deferred + documented OR fix.

**Entry criteria**: Phase 2 ✅.
**Exit criteria**: every P2/P3 test has status ∈ {✅, accepted-deferred-with-reason}.
**Who runs it**: me.

---

### Phase 4 — Security audit       |  ~2 hours · dedicated SEC-* sweep  ·  GATE: no security bugs

Even though SEC tests overlap with earlier phases, do a focused security pass. Bring an attacker mindset.

Includes: XSS injection in every text field, SQL injection attempts, CSRF forging, token leakage scan (grep network for keys), RLS bypass attempts, dependency CVE scan (`pnpm audit`, `gradle dependencyCheck`).

**Entry criteria**: Phases 0–2 ✅.
**Exit criteria**: zero security bugs in `BUGS.md`; SEC-* tests all ✅.
**Who runs it**: me + automated scanners.

---

### Phase 5 — Cross-device & multi-user  |  ~3 hours · two-user fixture  ·  GATE: RLS proven cross-user

Spin up a second test account (`vgakashvg+test2@gmail.com` or similar). Run all the AUTH-012, NOTE-027, AI-CHAT-024, ATT-013, NOTIF-008, CAL-014, SRCH-018 tests with two real concurrent sessions. Then sync conflict tests (SYNC-007/008/009) once Android is ready.

**Entry criteria**: Phases 0–4 ✅.
**Exit criteria**: 2-user RLS proven; conflict resolution works.
**Who runs it**: me.

---

### Phase 6 — Android device       |  ~4 hours · user-driven (phone needed)  ·  GATE: APK works on user's phone

The 35+ DROID-* and SYNC-* tests. Cannot be run without the user's physical device.

**Entry criteria**: Phases 0–5 ✅, APK built (already done: `app-debug.apk`).
**Exit criteria**: full Android usage works (sign in, notes, chat, calendar, notifications); cross-device sync verified between web and Android.
**Who runs it**: user (with my coaching via instructions).

---

### Phase 7 — Regression locked    |  ~ongoing · Playwright + GitHub Actions

Convert every Phase 1 + Phase 2 manual test into an automated Playwright e2e suite. Add to CI so future commits can't regress them.

**Entry criteria**: Phases 0–6 ✅.
**Exit criteria**: P0 Playwright suite green in CI on every PR; every new module ships with its e2e test.
**Who runs it**: me — write the tests; Claude Code wires them into CI.

---

## 4. Exit criteria for the whole program

The V1 is "bug-free" (operationally — not philosophically) when:

- ✅ Phases 0–6 all completed
- ✅ Zero P0 bugs open
- ✅ Zero P1 bugs open
- ✅ Every P2 bug is either fixed OR documented as accept-deferred with rationale
- ✅ Playwright P0 suite running green in CI
- ✅ One full week of daily usage by the owner with no new P0/P1 bugs filed
- ✅ Backup + restore tested at least once (DEVOPS-014)

Then we call V1 done. Before that, "feature complete" ≠ "done."

---

## 5. Status & next action

| Phase | Status | Notes |
|---|---|---|
| 0 — Smoke | ✅ Complete | All 8 health checks pass |
| 1 — Critical Path (P0) | ✅ Complete | All known P0 bugs (BUG-001, 002, 003, 011, 013) fixed and verified |
| 2 — Core (P1) | ✅ Complete | All P1 bugs (BUG-004, 005, 006, 012, 014, 016) fixed and verified |
| 3 — Polish (P2/P3) | ✅ Complete | All P2 bugs (BUG-007, 010, 015) fixed; one P3 (BUG-008) deferred-with-reason |
| 4 — Security audit | ✅ Complete | Discovered + fixed BUG-013 (P0 XSS) and BUG-015 (open-redirect). Dep audit triaged in BUG-014 |
| 5 — Cross-device | ⚠️ Deferred-with-reason | RLS proven via pgTAP (24+ assertions). Live 2-user testing requires a 2nd test Google account |
| 6 — Android device | ⚠️ Deferred-with-reason | APK structurally verified (62MB, valid classes.dex). On-device tests blocked on user's physical phone |
| 7 — Regression automation | ✅ Scaffold complete | 9 Playwright tests written (`e2e/tests/`). CI wiring deferred until Vercel preview is configured |

**Autonomous run completion**: 2026-05-23. All filed bugs (BUG-001–016) closed except BUG-008 (P3, non-blocking disk cleanup). Final CI run green on `5403fcd`.

**Right now**: 8 bugs found, 5 fixed, 3 open. Phase 1 in progress.

See `BUGS.md` for the live list and `TEST_PLAN.md` for the full case catalogue.

---

## 6. Conventions

**A test result** is recorded by updating the Status column in `TEST_PLAN.md` for that test ID.

**A bug** is created by appending an entry in `BUGS.md` with the next BUG-NNN number. Link the test ID that caught it.

**A bug fix** updates the bug's status, links the fix commit SHA, and re-runs the original test. If the test passes, mark the bug Closed.

**A new test discovered during exploration** is appended to `TEST_PLAN.md` with the appropriate domain prefix.

---

## 7. Document history

| Date | Author | Change |
|---|---|---|
| 2026-05-23 | Claude | Initial phase plan (7 phases, ~22 hours of testing) |
