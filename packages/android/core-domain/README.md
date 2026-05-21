# core-domain (Kotlin)

The canonical domain types for the Android client. Pure Kotlin — no Android,
no I/O, no DB. Mirrors `@notes-app/domain` (the TS twin) shape-for-shape so
the two clients can describe the same world.

## Public types

### IDs (`Ids.kt`)

Each ID is a `@JvmInline value class` wrapping a `String`. The `init` block
rejects empty values and anything that isn't a v1–v5 UUID. Erased to `String`
at runtime, so there is no boxing cost.

`UserId`, `NotebookId`, `TagId`, `NoteId`, `AttachmentId`,
`EmbeddingChunkId`, `ConversationId`.

### Enums (`Enums.kt`)

Sealed-class hierarchies (so the type system can prove exhaustive `when`),
each variant carrying a `wireName` string for wire-level (re)serialization.

- `StorageProviderId` — `GoogleDrive | OneDrive`
- `CalendarProviderId` — `GoogleCalendar | MicrosoftGraph`
- `AIProviderId` — `Ollama | Anthropic | OpenAI | Groq` (V1 ships Ollama only)
- `SyncDirection` — `enum class { UP, DOWN, BOTH }`
- `SyncStatus` — `Idle | Syncing | Error | Conflict` discriminated union

### Entities

`Notebook`, `Tag`, `AttachmentRef`, `Note`, `CalendarEvent`,
`EmbeddingChunk`, `AIPreferences`, `User`. All are `data class`es with their
invariants enforced in `init` blocks.

## Build & test

```powershell
# From notes-app\packages\android
.\gradlew.bat :core-domain:test
```

CI runs the same command via the wrapper on JDK 17.

## Swapping the adapter

This module is a port — there is no adapter to swap. Replacements must
preserve type names and package (`app.notes.domain`) so dependent modules
continue to compile unchanged.
