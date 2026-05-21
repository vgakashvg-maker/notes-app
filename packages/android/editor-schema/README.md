# editor-schema (Kotlin)

Mirror of `@notes-app/editor-schema`. Pure JVM Kotlin — same node catalogue,
same validator, same JSON↔Markdown converter. Both implementations are kept
in lockstep so the two clients render any stored note identically.

## Public types

- `SCHEMA_VERSION` — pinned to `1`, must match the TS twin.
- `BlockNodeName`, `InlineNodeName`, `MarkName` — enums carrying a
  `wireName` for cross-platform serialization.
- `DocNode`, `Doc`, `Mark` — document model.
- `validateDoc(doc)` — throws `SchemaValidationException` on the first
  violation.
- `jsonToMarkdown(doc)` / `markdownToJson(md)` — bidirectional converters.

## Build & test

```powershell
.\gradlew.bat :editor-schema:test
```
