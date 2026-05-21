# ADR 0004 — PostgREST row types: hand-write now, generate after launch

Date: 2026-05-21
Status: Accepted

## Context

The M04 spec says:

> All TypeScript SDK code is auto-generated from PostgREST types — do not
> hand-write CRUD wrappers.

The intent is to make `supabase gen types typescript` the source of truth
for row shapes, so when the schema changes the compiler tells us about
every consumer that needs updating.

In V1 we do not yet have a provisioned Supabase project. We cannot run
`supabase gen types` until one exists. We do, however, need M04 to be
usable from the moment it lands — sync engine (M05), AI services (M09),
and the editor (M06) all depend on it.

## Decision

- **Now (M04)**: ship `packages/notes/src/rows.ts` as a hand-written file
  that mirrors the schema in `supabase/migrations/20260520121000_notes_core.sql`
  exactly. The hand-written types live behind row-to-domain converters
  (`rowToNote`, `rowToNotebook`, `rowToTag`, `rowToAttachmentRef`) so
  consumers only see domain types.
- **Soon (once a dev Supabase project exists)**: replace
  `packages/notes/src/rows.ts` with the output of
  `supabase gen types typescript --linked --schema public > packages/notes/src/db.ts`,
  then re-export from `rows.ts` and re-point the converters at the
  generated types. This is a pure refactor — the public surface
  (`SupabaseNotesAdapter`, `NotesHttp`) does not change.
- **CI hook (after the rename above)**: extend `.github/workflows/ci.yml`
  with a `supabase gen types --check` step that fails if `db.ts` is stale
  relative to the migrations directory.

## Consequences

- For the duration of "before a Supabase project exists", the
  hand-written types are the contract. If the schema drifts from
  `rows.ts`, our tests will pass but runtime queries will fail. Mitigation:
  the `notes_core.sql` migration and `rows.ts` are reviewed together in
  the M04 commit; any schema change after that gets a paired update.
- The structural `NotesHttp` port shields call sites from the migration:
  swapping in generated types is a one-package change.
- We are deliberately not pulling in `@supabase/supabase-js` yet. Once
  the generated types land, M06 (web shell) and M12 (Android shell) wire
  the real client at the DI boundary.

## Alternatives considered

- **Block M04 on standing up a Supabase project**: would delay every
  downstream module that depends on `NotesService`. Rejected.
- **Skip hand-written types and call PostgREST with `unknown`**:
  removes type safety from the converters and pushes runtime errors into
  the calling code. Rejected.
