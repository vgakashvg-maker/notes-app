# Getting Started

This is the systematic process to go from zero to a working Evernote-like app
with a local AI second brain. Follow it stage by stage. **Do not skip stages.**

---

## Top-level flow

```
STAGE 0  → Prepare (accounts, tools, Ollama on Legion)        ~5 hours
STAGE 1  → Foundation (repos, auth, notes CRUD)               2–3 weeks
STAGE 2  → Editor & Sync                                      3–4 weeks
STAGE 3  → Attachments                                         1 week
STAGE 4  → Second Brain AI (Ollama)                           3 weeks
STAGE 5  → Advanced AI (briefing, related, memory)            2 weeks
STAGE 6  → Calendar & Reminders                               1–2 weeks
STAGE 7  → Polish & Personal Cutover                           2 weeks
```

Each stage ends with a **gate** — a small, real, end-to-end thing that
works. Don't proceed until the gate passes.

---

## Weekly inner loop

```
Monday morning
  • Pick the next module from the index in README.md
  • Open its spec at tech-specs/MNN-*.md

Brief the AI developer
  • Copy the "Ready-to-Use Prompt" from the bottom of the spec
  • Paste into Claude Code (or Cursor)
  • Add any prerequisite confirmation ("M1 and M2 are done; here's the repo")

AI writes code
  • Review each file
  • Push back on anything unclear ("section X of the spec says do Y; you did Z, redo")

Run it locally
  • Does it actually work end-to-end?
  • Does it pass the Definition of Done checklist?

If yes:
  • Commit, push, PR, merge
  • Move to the next module
If no:
  • Tell the AI what failed; loop back
```

---

## Stage 0 — Prepare (~5 hours, do this week)

### Day 1 — Create accounts (~2 hours)

| # | Task | Where | Cost |
|---|---|---|---|
| 1 | GitHub account | github.com | Free |
| 2 | Supabase account | supabase.com | Free |
| 3 | Anthropic Console (for AI dev assistance during build) | console.anthropic.com | ~$10 to start |
| 4 | Google Cloud Console project | console.cloud.google.com | Free |
| 5 | Vercel account (link to GitHub) | vercel.com | Free |
| 6 | Tailscale account | tailscale.com | Free |

### Day 2 — Install tools on the Legion (~2 hours)

| # | Tool | Source |
|---|---|---|
| 7 | Git for Windows | git-scm.com/download/win |
| 8 | Node.js LTS (20.x) | nodejs.org |
| 9 | pnpm | `npm install -g pnpm` |
| 10 | Android Studio | developer.android.com/studio |
| 11 | VS Code | code.visualstudio.com |
| 12 | Claude Code | claude.com/claude-code |
| 13 | Supabase CLI | `npm install -g supabase` |

### Day 3 — Get Ollama running (~1 hour)

Follow `../NotesApp_Architecture.docx` Section 17 step by step:

1. Install Ollama on the Legion.
2. `ollama pull llama3.1:8b llama3.2:3b nomic-embed-text`
3. Set the env vars (`OLLAMA_HOST`, `OLLAMA_KEEP_ALIVE=30m`, etc.).
4. Install Tailscale on the Legion + Android phone + laptop.
5. `tailscale funnel 11434` on the Legion.
6. Run the §17.8 validation checklist (6 commands).

If all 6 pass, your AI infrastructure is done. You won't touch it again.

### Day 4 — Empty project skeleton (~30 minutes)

```
1. On GitHub, create a private repo: notes-app
2. Clone locally: git clone https://github.com/<you>/notes-app.git
3. Open in VS Code; open a terminal; run: claude
4. First prompt to Claude Code:

   "Read the architecture at C:\Users\vgaka\Evernotelike\NotesApp_Architecture.docx
    and the README at C:\Users\vgaka\Evernotelike\README.md.
    Then scaffold the repo per §7: a pnpm monorepo with packages for each
    module (M1–M15), empty stubs only. No implementation yet. Add a root
    README and a basic .gitignore."

5. Review what Claude creates; commit; push.
```

---

## Stage 1 — Foundation (Weeks 1–3)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 1 | M14 DevOps basics | tech-specs/M14-devops.md | Haiku |
| 1 | M1 Domain Model | tech-specs/M01-domain-model.md | Sonnet |
| 2 | M2 Auth | tech-specs/M02-auth.md | Opus + Sonnet |
| 2–3 | M4 Notes Core | tech-specs/M04-notes-core.md | Sonnet |
| 3 | Wire-up | (small task to integrate M1+M2+M4 into one demo screen) | Sonnet |

**Gate**: You can sign in with Google on web AND Android, create a plain-text
note, and see it on the other client. Done? Proceed to Stage 2.

---

## Stage 2 — Editor & Sync (Weeks 4–7)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 4–5 | M6 Editor (web) | tech-specs/M06-editor.md | Sonnet |
| 4–5 | M6 Editor (Android) | tech-specs/M06-editor.md | Opus |
| 5–7 | M5 Sync Engine | tech-specs/M05-sync-engine.md | Opus |

**Gate**: Edit a note offline on Android. Re-open web later. The note is
there with all edits. Make conflicting edits on both clients while offline;
the system creates a conflict note instead of silently dropping data.

---

## Stage 3 — Attachments (Week 8)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 8 | M3 Storage Provider (Google Drive) | tech-specs/M03-storage-provider.md | Opus |
| 8 | M7 Attachment Pipeline | tech-specs/M07-attachment-pipeline.md | Sonnet |

**Gate**: Attach a PDF on web. Open it on Android. Delete it; re-open web; gone.

---

## Stage 4 — Second-Brain AI (Weeks 9–11)

| Week | Module | Spec | AI dev |
|---|---|---|---|
| 9 | M10 Embedding & Vector Search | tech-specs/M10-embedding-vector.md | Sonnet |
| 9–11 | M9 AI Services (Ollama adapter, chat, summarize, tag, title) | tech-specs/M09-ai-services.md | Opus |
| 10–11 | M15 AI Settings & Routing | tech-specs/M15-ai-settings-routing.md | Opus + Sonnet |

**Gate**: Ask the AI "what did I write about <topic>?" — get a cited answer
that links to actual notes. Switch the chat model from llama3.1:8b to
qwen2.5:7b in Settings; chat keeps working.

---

## Stage 5 — Advanced AI (Weeks 12–13)

(Extensions to M9 — no new module IDs)

- Related-notes panel in the editor (vector only)
- Daily briefing job (pg_cron)
- AI memory extraction (long-term facts)
- Cost/usage dashboard in Settings

**Gate**: You wake up Tuesday and your phone has a Markdown briefing of what
you wrote Monday and what's on today's calendar.

---

## Stage 6 — Calendar & Reminders (Week 14)

| Module | Spec | AI dev |
|---|---|---|
| M8 Calendar Integration | tech-specs/M08-calendar-integration.md | Sonnet |
| M11 Notifications | tech-specs/M11-notifications.md | Haiku |

**Gate**: Today view shows today's Calendar events + notes due today, merged
and sorted by time. From a note, you can create a Calendar event.

---

## Stage 7 — Polish & Personal Cutover (Week 15)

- Export your Evernote .enex; write a one-off importer (or hand to Sonnet).
- Use the app exclusively for a week. Note every annoyance.
- Fix the top 10 annoyances.
- Cancel Evernote.

---

## The single most important rule

**You are not coding this. You are directing AI to code this.** Your real job:

1. Read the architecture doc and module specs carefully.
2. Paste the right module's "Ready-to-Use Prompt" into Claude Code.
3. Review what comes back; push back when wrong.
4. Test the gates at the end of each stage.

If you treat the specs as the contract, this works. If you treat them as
optional reading, the AI will hallucinate plausible-but-wrong code and you'll
waste weeks.

---

## When to stop and ask for help

- A module is over schedule by more than 50%. Re-scope or split.
- The AI keeps producing code that fails its own tests. The spec is probably
  ambiguous — rewrite the spec, not the prompt.
- A gate's success condition is fuzzy. Stop and make it concrete before
  proceeding.
