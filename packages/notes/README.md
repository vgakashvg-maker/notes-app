# @notes-app/notes

The Notes Core port + Supabase adapter + the pure-logic half of the
`notes/bulk-update` Edge Function.

## Public types

### `NotesService` port (`src/types.ts`)

The full CRUD + search surface from `tech-specs/M04-notes-core.md`. Consumers
(sync engine, editor, AI services) depend on this interface only.

### `SupabaseNotesAdapter` (`src/supabase-notes-adapter.ts`)

The V1 adapter. Constructed against a thin `NotesHttp` interface
(`src/notes-http.ts`) that mirrors the PostgREST operations we use. The
production binding wraps `@supabase/supabase-js` + the generated `Database`
type from `supabase gen types`; tests pass a fake.

Validates inputs locally (blank title, malformed JSON, page bounds) before
hitting the wire so misuse fails fast — RLS catches the rest.

### Row types and converters (`src/rows.ts`)

Hand-written PostgREST row shapes plus `rowToNote` / `rowToNotebook` /
`rowToTag` / `rowToAttachmentRef`. Once a real Supabase project exists, this
file is replaced by `supabase gen types typescript` output — see
[ADR 0004](../../docs/adr/0004-postgrest-type-generation.md) for the
transition plan.

### `bulkUpdate` (`src/bulk-update.ts`)

Pure-logic backing for the `notes/bulk-update` Edge Function: a
`parseBulkUpdate` validator that accepts move / addTag / removeTag /
trash / restore operations on up to 500 note IDs, plus a `bulkUpdate`
function that delegates the SQL UPDATE to an injected `execute` callback.
The Deno entry at `supabase/functions/notes/bulk-update/index.ts` wires
the executor to the Supabase service-role client.

## Conventions

- All adapter methods are `async` and reject on validation failure rather
  than returning a result type — caller error is a programming bug, not a
  user-visible state.
- `searchKeyword("")` returns `[]` synchronously without a network round
  trip; the editor's debounced search uses this to clear results without
  thrashing.

## Swapping the adapter

Implement `NotesService` directly, or implement `NotesHttp` to keep the
adapter's logic and only swap the wire format. M06 (web shell) and M12
(Android shell) pick the concrete bindings at the DI graph.
