# @notes-app/domain

The canonical domain types for the notes app. Pure TypeScript, no I/O, no
framework dependencies, no provider knowledge. Every other TS module imports
its entities from here.

## Public types

### Branded ID constructors (`src/ids.ts`)

`UserId`, `NotebookId`, `TagId`, `NoteId`, `AttachmentId`,
`EmbeddingChunkId`, `ConversationId`. Each is both a TypeScript type (branded
`string`) and a same-named factory function that validates the raw value is
a non-empty UUID and returns the branded value. Passing one ID type where
another is expected is a compile error.

### Sealed-union enums (`src/enums.ts`)

- `StorageProviderId` — `"GOOGLE_DRIVE" | "ONEDRIVE"`
- `CalendarProviderId` — `"GOOGLE_CALENDAR" | "MICROSOFT_GRAPH"`
- `AIProviderId` — `"OLLAMA" | "ANTHROPIC" | "OPENAI" | "GROQ"` (V1 ships OLLAMA only)
- `SyncDirection` — `"UP" | "DOWN" | "BOTH"`
- `SyncStatus` — tagged union (`Idle | Syncing | Error | Conflict`) with
  smart constructors on the `SyncStatus` namespace value.

Each enum exports a `*Ids` const array so runtime callers can iterate /
validate.

### Entities

| Type | File | Factory |
|------|------|---------|
| `Notebook` | `src/notebook.ts` | `makeNotebook(input)` |
| `Tag` | `src/tag.ts` | `makeTag(input)` |
| `AttachmentRef` | `src/attachment.ts` | `makeAttachmentRef(input)` |
| `Note` | `src/note.ts` | `makeNote(input)` |
| `CalendarEvent` | `src/calendar.ts` | `makeCalendarEvent(input)` |
| `EmbeddingChunk` | `src/embedding.ts` | `makeEmbeddingChunk(input)` |
| `User` (with `AIPreferences`) | `src/user.ts` | `makeUser(input)` |

Every factory enforces the spec's invariants (non-empty strings,
ISO-8601 timestamps, valid JSON for `Note.bodyJson`, hex colors for
`Notebook.color` and `Tag.color`, etc.) and throws a descriptive `Error` on
violation.

## Conventions

- Timestamps are ISO-8601 strings (`Note.createdAt`, etc.).
- All fields are `readonly`; create modified copies with the spread operator
  and re-run the relevant factory if you need to re-validate.
- Branded ID values are runtime-equal to their raw string — they only differ
  at the type level.

## Swapping the adapter

This package is the port layer for the domain itself — it has no adapter.
A replacement implementation must preserve identical type names and shapes
so that every other workspace package keeps compiling.
