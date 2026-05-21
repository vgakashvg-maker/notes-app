# M01 — Domain Model & Shared Types

> **Module ID**: `M01`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 2–3 days
> **Depends on**: (nothing)

---

## Purpose

Define the canonical domain entities — Note, Notebook, Tag, Attachment, Event, Embedding, User — as plain data classes with no provider knowledge. This module is the lingua franca every other module imports.

---

## Public Interface (the port)

```kotlin
// Kotlin — shared types (Android + future KMP)
data class Note(
  val id: NoteId,
  val ownerId: UserId,
  val notebookId: NotebookId?,
  val title: String,
  val bodyJson: String,            // ProseMirror JSON
  val tags: Set<TagId>,
  val createdAt: Instant,
  val updatedAt: Instant,
  val isPinned: Boolean,
  val isTrashed: Boolean,
  val attachmentRefs: List<AttachmentRef>
)

data class AttachmentRef(
  val id: AttachmentId,
  val provider: StorageProviderId, // GOOGLE_DRIVE | ONEDRIVE | ...
  val externalFileId: String,
  val mimeType: String,
  val sizeBytes: Long,
  val displayName: String
)

// All ID types are value classes (Kotlin) / branded types (TS) to prevent
// argument mix-ups at compile time. Example:
@JvmInline value class NoteId(val raw: String)
@JvmInline value class UserId(val raw: String)
```

---

## Responsibilities

- Pure data classes / TypeScript types — no I/O, no framework code.
- ID types are opaque (value classes / branded types) to prevent mix-ups.
- Validation invariants are enforced in constructors (e.g., non-empty title, valid UUID).
- All timestamps are `Instant` (Kotlin) / ISO-8601 strings (TS).
- Sealed-class enums for: StorageProviderId, CalendarProviderId, AIProviderId, SyncStatus.

---

## Deliverables

- Kotlin module `core-domain` with all entity classes and value-class IDs.
- TypeScript package `@app/domain` mirroring the same shapes.
- Unit tests for every invariant (e.g., 'Note with empty title throws').
- README in each package listing every public type.

---

## Relevant Data Model

_(none — this module doesn't directly own DB tables)_

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
You are implementing module M1 (Domain Model & Shared Types) of the Evernote-like
notes app. Read the full spec in `tech-specs/M01-domain-model.md` before starting.

Your job: create two packages that hold the canonical domain types.

  1. Kotlin module `core-domain/` in the Android codebase. Each entity is a
     data class. Each ID is a `@JvmInline value class`. Validation invariants
     are enforced in init blocks.

  2. TypeScript package `@app/domain` in the monorepo (workspace-style). Each
     entity is a TS interface; each ID is a branded type
     (e.g., `type NoteId = string & { __brand: 'NoteId' }`).

For both packages:
  - Include all entities listed in the spec (Note, Notebook, Tag,
    AttachmentRef, CalendarEvent, EmbeddingChunk, User, plus all enum/sealed
    types).
  - Include unit tests for every constructor invariant. Use JUnit 5 (Kotlin)
    and Vitest (TS).
  - Write a README.md in each package that lists every public type.
  - No I/O. No framework dependencies. No DB code. This module is pure types.

Definition of Done is in section 'Definition of Done' of the spec. Run the
tests yourself before reporting back; do not hand off code that fails its
own tests.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.1
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
