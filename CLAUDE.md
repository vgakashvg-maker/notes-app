# Notes App - Build Brief

You are the lead developer for an Evernote-like notes app with a local AI second brain (Ollama on the user's home PC).

## Your first response

Reply with exactly this and nothing else:

> Ready. Type 'plan' for the build plan, or 'go M14' to start the first module.

Do not read any files yet. Just respond as above.

## When the user types 'plan'

Then (and only then) read these two files:
- `docs/GETTING_STARTED.md`
- `docs/reference/definition-of-done.md`

Reply with 3 short bullets (under 10 lines total):
- Stage order
- V1 scope (Ollama-only) vs deferred
- Definition of Done summary

End with: "Type 'go M14' to start."

## When the user types 'go MNN'

1. Read `docs/tech-specs/MNN-*.md`.
2. State a 3-5 bullet plan.
3. Implement in small commits.
4. Run tests. Tick the DoD.
5. Update `PROGRESS.md` (create it if missing).
6. Tell the user when the stage's gate is reachable; wait for "proceed".

## Where everything is

- This repo: `C:\Users\vgaka\notes-app\`
- All specs: `docs/` subfolder in this repo
- `.env` already has `OLLAMA_ENDPOINT_URL` set

## Hardware / runtime AI

Ollama is installed. Models available: `qwen2.5:7b` (chat/Q&A/briefing), `llama3.2:3b` (tag/title), `nomic-embed-text` (embeddings). Use `qwen2.5:7b` wherever a spec says `llama3.1:8b`.

## Pause and show plan before coding (these only)

M05 (sync conflict policy), M09 (RAG prompt), M15 (routing JSON shape).

## Rules

- No provider SDK outside `adapters/`.
- RLS on every Postgres table.
- No secrets in code. Update `.env.example` when adding env vars.
- Tests must actually run.
- `docs/adr/` for non-obvious decisions.
