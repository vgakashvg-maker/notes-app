import {
  BLOCK_NODE_NAMES,
  INLINE_NODE_NAMES,
  MARK_NAMES,
  type DocNode,
  type DocRoot,
  type NodeName,
} from "./schema.js";

const BLOCK_SET = new Set<NodeName>(BLOCK_NODE_NAMES);
const INLINE_SET = new Set<NodeName>(INLINE_NODE_NAMES);
const MARK_SET = new Set<string>(MARK_NAMES);

/**
 * Structural validation against the frozen schema. Throws on the first
 * violation with a path so the offending node is easy to locate. Cheap
 * enough to run on every document load.
 */
export function validateDoc(doc: unknown): asserts doc is DocRoot {
  if (typeof doc !== "object" || doc === null) {
    throw new Error("doc must be an object");
  }
  const root = doc as DocNode;
  if (root.type !== "doc") {
    throw new Error(`doc.type must be 'doc', got ${JSON.stringify(root.type)}`);
  }
  if (!Array.isArray(root.content)) {
    throw new Error("doc.content must be an array");
  }
  for (let i = 0; i < root.content.length; i += 1) {
    validateBlock(root.content[i] as DocNode, `content[${i}]`);
  }
}

function validateBlock(node: DocNode, path: string): void {
  if (!BLOCK_SET.has(node.type)) {
    throw new Error(`${path}: unknown block node ${JSON.stringify(node.type)}`);
  }
  switch (node.type) {
    case "paragraph":
      validateInlineContent(node, path);
      return;
    case "heading":
      validateHeading(node, path);
      return;
    case "bullet_list":
    case "ordered_list":
      validateListItems(node, path, "list_item");
      return;
    case "check_list":
      validateListItems(node, path, "check_list_item");
      return;
    case "code_block":
      validateCodeBlock(node, path);
      return;
    case "image":
      validateImage(node, path);
      return;
    case "attachment":
      validateAttachment(node, path);
      return;
    default:
      throw new Error(`${path}: unhandled block ${JSON.stringify(node.type)}`);
  }
}

function validateHeading(node: DocNode, path: string): void {
  const level = (node.attrs as { level?: unknown } | undefined)?.level;
  if (level !== 1 && level !== 2 && level !== 3) {
    throw new Error(`${path}: heading.attrs.level must be 1, 2, or 3`);
  }
  validateInlineContent(node, path);
}

function validateListItems(node: DocNode, path: string, expected: NodeName): void {
  if (!Array.isArray(node.content)) {
    throw new Error(`${path}: list must have a content array`);
  }
  for (let i = 0; i < node.content.length; i += 1) {
    const child = node.content[i] as DocNode;
    if (child.type !== expected) {
      throw new Error(
        `${path}.content[${i}]: expected ${expected}, got ${JSON.stringify(child.type)}`,
      );
    }
    if (!Array.isArray(child.content)) {
      throw new Error(`${path}.content[${i}].content must be an array`);
    }
    if (expected === "check_list_item") {
      const checked = (child.attrs as { checked?: unknown } | undefined)?.checked;
      if (typeof checked !== "boolean") {
        throw new Error(`${path}.content[${i}].attrs.checked must be a boolean`);
      }
    }
    for (let j = 0; j < child.content.length; j += 1) {
      validateBlockInListItem(child.content[j] as DocNode, `${path}.content[${i}].content[${j}]`);
    }
  }
}

function validateBlockInListItem(node: DocNode, path: string): void {
  if (
    node.type !== "paragraph" &&
    node.type !== "bullet_list" &&
    node.type !== "ordered_list" &&
    node.type !== "check_list"
  ) {
    throw new Error(
      `${path}: only paragraph or nested lists allowed inside list items, got ${JSON.stringify(node.type)}`,
    );
  }
  validateBlock(node, path);
}

function validateCodeBlock(node: DocNode, path: string): void {
  const lang = (node.attrs as { language?: unknown } | undefined)?.language;
  if (lang !== undefined && lang !== null && typeof lang !== "string") {
    throw new Error(`${path}: code_block.attrs.language must be a string or null`);
  }
  if (!Array.isArray(node.content)) {
    throw new Error(`${path}: code_block.content must be an array of text nodes`);
  }
  for (let i = 0; i < node.content.length; i += 1) {
    const child = node.content[i] as DocNode;
    if (child.type !== "text" || typeof child.text !== "string") {
      throw new Error(`${path}.content[${i}]: code_block may only contain text nodes`);
    }
    if (Array.isArray(child.marks) && child.marks.length > 0) {
      throw new Error(`${path}.content[${i}]: marks are not allowed inside a code_block`);
    }
  }
}

function validateImage(node: DocNode, path: string): void {
  const attrs = (node.attrs as { src?: unknown; alt?: unknown } | undefined) ?? {};
  if (typeof attrs.src !== "string" || attrs.src.length === 0) {
    throw new Error(`${path}: image.attrs.src must be a non-empty string`);
  }
  if (attrs.alt !== undefined && typeof attrs.alt !== "string") {
    throw new Error(`${path}: image.attrs.alt must be a string when present`);
  }
}

function validateAttachment(node: DocNode, path: string): void {
  const attrs = (node.attrs as { attachmentId?: unknown; displayName?: unknown } | undefined) ?? {};
  if (typeof attrs.attachmentId !== "string" || attrs.attachmentId.length === 0) {
    throw new Error(`${path}: attachment.attrs.attachmentId must be a non-empty string`);
  }
  if (typeof attrs.displayName !== "string" || attrs.displayName.length === 0) {
    throw new Error(`${path}: attachment.attrs.displayName must be a non-empty string`);
  }
}

function validateInlineContent(node: DocNode, path: string): void {
  const content = node.content ?? [];
  for (let i = 0; i < content.length; i += 1) {
    const child = content[i] as DocNode;
    if (!INLINE_SET.has(child.type)) {
      throw new Error(`${path}.content[${i}]: unknown inline node ${JSON.stringify(child.type)}`);
    }
    if (child.type === "text") {
      if (typeof child.text !== "string" || child.text.length === 0) {
        throw new Error(`${path}.content[${i}]: text nodes need a non-empty text field`);
      }
      validateMarks(child.marks ?? [], `${path}.content[${i}]`);
    } else if (child.type === "code_inline") {
      if (typeof child.text !== "string" || child.text.length === 0) {
        throw new Error(`${path}.content[${i}]: code_inline needs a non-empty text field`);
      }
    } else if (child.type === "internal_link") {
      const noteId = (child.attrs as { noteId?: unknown } | undefined)?.noteId;
      if (typeof noteId !== "string" || noteId.length === 0) {
        throw new Error(`${path}.content[${i}]: internal_link.attrs.noteId must be non-empty`);
      }
    }
  }
}

function validateMarks(marks: readonly { type: string }[], path: string): void {
  const seen = new Set<string>();
  for (let i = 0; i < marks.length; i += 1) {
    const m = marks[i];
    if (m === undefined || !MARK_SET.has(m.type)) {
      throw new Error(`${path}.marks[${i}]: unknown mark ${JSON.stringify(m?.type)}`);
    }
    if (seen.has(m.type)) {
      throw new Error(`${path}.marks[${i}]: duplicate mark ${JSON.stringify(m.type)}`);
    }
    seen.add(m.type);
  }
}
