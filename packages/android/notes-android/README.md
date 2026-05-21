# notes-android (Kotlin)

The Kotlin port + Supabase adapter for the Notes Core module. Pure-JVM
Kotlin so the adapter logic stays testable without the Android SDK; the
Android-specific binding (supabase-kt + Ktor client behind the
`NotesHttp` port) lands in M12.

## Public types

- `NotesService` — the port mirroring `tech-specs/M04-notes-core.md`.
- `SupabaseNotesAdapter` — V1 adapter. Constructor takes a `NotesHttp`.
- `NotesHttp` — port for the wire layer; faked in unit tests, M12 supplies
  the real client.
- Inputs: `NewNoteInput`, `NotePatch` (carries `notebookIdSet` to distinguish
  "don't change" from "set to null"), `NewNotebookInput`, `NewTagInput`.
- Filters / pagination: `NoteFilter`, `Page` (bounds-checked: limit ≤ 200).
- Results: `PagedResult<T>`, `NoteHit` (note + snippet + rank).
- `NotesNotFoundException` for 404 lookups.

## Build & test

```powershell
.\gradlew.bat :notes-android:test
```
