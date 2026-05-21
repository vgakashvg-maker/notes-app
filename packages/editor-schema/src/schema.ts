/**
 * Frozen ProseMirror schema for notes-app. The schema is intentionally tiny
 * and conservative — adding a node is a deliberate decision that requires
 * a migration plan because every existing note must still render under the
 * new schema.
 *
 * The schema is declared as plain data here so both clients (Tiptap on the
 * web, the Compose renderer on Android) can build their concrete schema
 * instances from the same source. The Kotlin mirror lives at
 * `packages/android/editor-schema/.../Schema.kt`.
 */

/** Bump only when an incompatible node/mark is added or removed. */
export const SCHEMA_VERSION = 1;

/** The set of block-level node names allowed at the top of the document. */
export const BLOCK_NODE_NAMES = [
  "paragraph",
  "heading",
  "bullet_list",
  "ordered_list",
  "check_list",
  "code_block",
  "image",
  "attachment",
] as const;
export type BlockNodeName = (typeof BLOCK_NODE_NAMES)[number];

/** Inline node names that can appear inside a paragraph or heading. */
export const INLINE_NODE_NAMES = ["text", "code_inline", "internal_link", "hard_break"] as const;
export type InlineNodeName = (typeof INLINE_NODE_NAMES)[number];

export type NodeName = "doc" | "list_item" | "check_list_item" | BlockNodeName | InlineNodeName;

/** Marks applied to text runs. */
export const MARK_NAMES = ["bold", "italic", "strike"] as const;
export type MarkName = (typeof MARK_NAMES)[number];

export interface MarkInstance {
  readonly type: MarkName;
}

/** Shape every document node must satisfy. */
export interface DocNode {
  readonly type: NodeName;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly DocNode[];
  readonly text?: string;
  readonly marks?: readonly MarkInstance[];
}

/** Top-level document. */
export interface DocRoot extends DocNode {
  readonly type: "doc";
  readonly content: readonly DocNode[];
}

/** Build an empty doc (the schema's identity element). */
export function emptyDoc(): DocRoot {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Cheap structural validation — full validation is in `validateDoc()`. */
export function isDocRoot(value: unknown): value is DocRoot {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}
