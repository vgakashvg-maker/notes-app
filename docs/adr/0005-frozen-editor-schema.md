# ADR 0005 — Frozen ProseMirror schema with explicit `SCHEMA_VERSION`

Date: 2026-05-21
Status: Accepted

## Context

M06 introduces the document model both clients (Tiptap web, Compose Android)
will render. Every change to the schema has downstream cost: every stored
note must keep rendering under the new schema, sync (M05) must keep
shipping conformant JSON, the AI services (M09) keep ingesting the same
shape, and the FTS extractor in M04 (`extract_plain_from_prosemirror`)
keeps producing useful text.

We also need cross-platform parity: the same `body_json` must mean the
same rendered output on both clients.

## Decision

1. **The schema is frozen** at the node + mark catalogue defined in
   `packages/editor-schema/src/schema.ts` (mirrored in
   `packages/android/editor-schema/.../Schema.kt`). The catalogue is:

   - Blocks: `paragraph`, `heading` (levels 1–3), `bullet_list`,
     `ordered_list`, `check_list`, `code_block`, `image`, `attachment`.
   - Inlines: `text`, `code_inline`, `internal_link`, `hard_break`.
   - Marks: `bold`, `italic`, `strike`.

2. **`SCHEMA_VERSION` ships with every doc** (constant in both languages;
   currently `1`). It is the migration knob — bumping it means existing
   notes need conversion. We will not silently change the node set.

3. **Bidirectional Markdown converter** is the cross-platform reference.
   Round-trip property tests (TS: fast-check; Kotlin: explicit fixtures
   + the cross-side fixture suite) defend the converter against drift.

4. **UI bindings are pluggable**: the Tiptap web editor (lands with the
   Next.js shell in **M13**) and the Compose Android renderer (lands with
   the Android shell in **M12**) both import this schema package and
   build their concrete schema instances from it. The schema itself
   never imports a UI framework.

5. **AI actions and paste classifier are ports**, not bound to a vendor.
   `AICommand` lives here; M09 supplies concrete implementations of the
   three V1 commands (Summarize selection, Improve writing, Extract
   action items).

## Consequences

- Adding a new node (e.g. table) is a deliberate two-step PR: bump
  `SCHEMA_VERSION`, write the migration that promotes every existing
  `body_json` to the new version, then ship the editor bindings.
- The Markdown round-trip is text-preserving for the editor's emit
  surface (the property tests document the boundaries: no leading/trailing
  whitespace in text nodes, single-paragraph list items). The editor's UI
  layer guarantees those constraints; users cannot create a doc that
  violates them via normal editing.
- The `extract_plain_from_prosemirror` PL/pgSQL function in the M04
  migration is bound to this schema. Schema changes require updating that
  function too — there's a comment in the migration cross-referencing this
  ADR.

## Alternatives considered

- **Free-form ProseMirror schema** (no freeze): rejected. The cost of
  rendering arbitrary user-defined nodes on a Compose surface is too high
  for V1.
- **Use a Markdown source-of-truth** instead of ProseMirror JSON: rejected.
  Markdown's quirks (lazy-line continuation, ambiguous emphasis, multiple
  parser dialects) would make the two clients drift; the bespoke
  converter keeps the surface tight and verifiable.
- **Codegen from a single schema definition file**: rejected for V1. The
  catalogue is small enough that hand-mirroring the Kotlin and TS files
  is cheaper than a codegen pipeline. If the catalogue grows past ~20
  nodes we'll revisit.
