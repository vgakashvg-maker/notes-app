# @notes-app/editor-schema

The frozen ProseMirror schema + bidirectional JSON↔Markdown converter that
both the web (Tiptap) and Android (Compose) editors will pin to in M06.
Pure TypeScript, no UI dependencies.

## Public surface

- `SCHEMA_VERSION` — bumped only on incompatible schema changes (each bump
  needs a migration plan because every stored note must still render).
- `BLOCK_NODE_NAMES`, `INLINE_NODE_NAMES`, `MARK_NAMES` — the closed sets
  of nodes/marks the schema allows.
- `DocRoot`, `DocNode`, `MarkInstance` — TypeScript shapes.
- `validateDoc(doc)` — structural validation, throws on the first
  violation. Fast enough to run on every load.
- `jsonToMarkdown(doc)` / `markdownToJson(md)` — bidirectional converters.
- `AICommand`, `AICommandInput`, `AICommandResult` — the port for the
  slash-command menu. Concrete implementations come from `@notes-app/ai`
  (M09).
- `classifyPaste(input)` — paste classifier (`html | markdown | plain`).
- `attachmentNodeAttrs(ref)` — converts an `AttachmentRef` from the
  domain layer into schema attrs.

## Round-trip guarantee

Property-based tests (fast-check) assert that `markdownToJson ∘ jsonToMarkdown`
preserves the document up to text-node merging (which is a no-op for the
rendered result). The Kotlin twin
(`packages/android/editor-schema/.../Markdown.kt`) ships the same tests.

## Where the UI lives

- The Tiptap-based web editor (`packages/editor-web`) and its Storybook
  stories land in **M13** once the Next.js shell is bootstrapped.
- The Compose Android editor (`packages/android/editor-android`) lands in
  **M12** when the Android shell exists.

Both will import this package and build their concrete schema instances
from the data here. Changing the catalogue here is the single point of
change for both clients.
