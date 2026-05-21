# M06 — Editor Module (Web + Android)

> **Module ID**: `M06`
> **Complexity / Recommended AI dev**: Opus (Android) + Sonnet (Web)
> **Estimated duration**: 10–14 days (split across platforms)
> **Depends on**: M01, M03, M07, M09

---

## Purpose

Rich-text editor with a shared JSON document model (ProseMirror schema) so notes render identically on both clients.

---

## Public Interface (the port)

```kotlin
// Document model: ProseMirror JSON
// Web: Tiptap editor with custom extensions
// Android: a Compose renderer + editor that reads/writes the same JSON

interface NoteEditor {
  fun load(json: String)
  fun toJson(): String
  fun toMarkdown(): String
  fun insertAttachment(ref: AttachmentRef)
  fun registerAICommand(cmd: AICommand)   // e.g., 'Summarize selection'
  fun onChange(handler: (json: String) -> Unit)
}
```

---

## Responsibilities

- Define a frozen ProseMirror schema in a shared file: headings (1-3), paragraphs, bullet/ordered lists, checkbox lists, code (inline + block), image, attachment, internal-link.
- Web: implement with Tiptap; ship custom nodes for `attachment` and `internalLink`.
- Android: ship a Compose renderer for the schema; for V1, edit-in-Markdown with WYSIWYG render. Full Compose rich-text editor is V1.5.
- Inline AI actions: 'Summarize', 'Improve writing', 'Extract action items' as slash-commands (web) and overflow-menu items (Android).
- JSON ↔ Markdown converter — shared logic, mirrored across platforms.
- Paste handling: paste of HTML (from web) and Markdown (from copies) converted to schema-conformant JSON.

---

## Deliverables

- Frozen schema definition file `packages/editor-schema/schema.ts` (the source of truth).
- Web package `editor-web` (Tiptap-based).
- Android module `editor-android` (Compose).
- Bidirectional JSON ↔ Markdown converter with property-based tests (round-trip preserves content).
- Storybook-style demo page for the web editor.
- Screenshot tests for the Android renderer.

---

## Relevant Data Model

- `notes (body_json column)`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

_(none — this module is internal-facing)_

(Full API contract: `reference/api-contract.md`)

---

## Definition of Done

Apply the checklist in `reference/definition-of-done.md` in full. The
module-specific extras are:

- All items in **Deliverables** above are produced and reviewed.
- All items in **Responsibilities** above are demonstrably true (point at the
  code that proves each one).
- The module-specific tests listed in the **Ready-to-Use Prompt** below pass
  in CI.

---

## Ready-to-Use Prompt (paste this into Claude Code / Cursor)

```
You are implementing module M6 (Editor) of the Evernote-like notes app. Read
`tech-specs/M06-editor.md` before starting.

This module spans WEB and ANDROID. Confirm with the human which platform you
are building right now — they should be built in parallel by different
Claude Code sessions to avoid merge conflicts.

Prerequisites:
  - M1 (core-domain) is done.
  - M3 (storage-provider) and M7 (attachment-pipeline) are done OR provide
    stubs; editor needs `insertAttachment(ref)` to work end-to-end.
  - M9 (AI services) is done OR provides stubs for AI slash-commands.

Phase 1 — schema (both platforms share this):
  1. Create `packages/editor-schema/schema.ts`. Define ProseMirror nodes:
     doc, paragraph, heading (1-3), bullet_list, ordered_list, list_item,
     check_list_item, code_block, code_inline, image, attachment,
     internal_link, hard_break.
  2. Write a JSON ↔ Markdown converter in `packages/editor-schema/markdown.ts`.
  3. Write property-based tests: any valid JSON round-trips to Markdown and
     back without loss (use fast-check).

Phase 2 — WEB editor:
  4. `packages/editor-web/` using Tiptap v2. Implement the schema above with
     Tiptap's Node API. Custom nodes: `attachment` (shows file pill with
     click-to-open), `internalLink` (shows `[[Note Title]]` style).
  5. Slash-command menu with three AI actions wired to M9: Summarize selection,
     Improve writing, Extract action items.
  6. Paste handler: detect HTML vs Markdown vs plain text, convert to schema.
  7. Storybook story for each node.

Phase 3 — ANDROID editor (build only if assigned this platform):
  8. `editor-android/` Compose module. For V1 ship a Markdown-edit-with-
     WYSIWYG-preview UX: tap to toggle between edit mode (Markdown text) and
     read mode (rendered Compose).
  9. Render every schema node as a Composable. Use AnnotatedString for
     inline formatting.
  10. Overflow menu in toolbar provides the same three AI actions (Summarize,
      Improve, Action items).

Tests:
  - Round-trip JSON ↔ Markdown property tests (cross-platform).
  - Tiptap unit tests for each custom node.
  - Android screenshot tests using Paparazzi for the renderer.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.6
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
