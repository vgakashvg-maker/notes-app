import {
  emptyDoc,
  type DocNode,
  type DocRoot,
  type MarkInstance,
  type MarkName,
} from "./schema.js";
import { validateDoc } from "./validate.js";

/**
 * Bidirectional JSON ↔ Markdown converter for the frozen schema.
 *
 * Design constraints:
 * - Round-trip preservation for the subset of Markdown the schema models —
 *   property-based tests (markdown.test.ts) check that
 *   `markdownToJson(jsonToMarkdown(doc))` equals `doc` (modulo cosmetic
 *   whitespace) for any well-formed doc.
 * - No external Markdown parser — the surface we need is small (headings,
 *   lists, code, images, attachments, internal links, hard breaks) and a
 *   bespoke parser is easier to keep in sync with the Kotlin twin than a
 *   third-party parser.
 */

// ---------- JSON → Markdown ----------

export function jsonToMarkdown(doc: DocRoot): string {
  validateDoc(doc);
  const lines: string[] = [];
  const content = doc.content ?? [];
  for (let i = 0; i < content.length; i += 1) {
    const block = content[i] as DocNode;
    lines.push(blockToMarkdown(block));
    if (i < content.length - 1) lines.push("");
  }
  return lines.join("\n");
}

function blockToMarkdown(node: DocNode): string {
  switch (node.type) {
    case "paragraph":
      return inlineToMarkdown(node.content ?? []);
    case "heading": {
      const level = (node.attrs as { level: 1 | 2 | 3 }).level;
      return `${"#".repeat(level)} ${inlineToMarkdown(node.content ?? [])}`;
    }
    case "bullet_list":
      return listToMarkdown(node, () => "- ");
    case "ordered_list":
      return listToMarkdown(node, (i) => `${i + 1}. `);
    case "check_list":
      return checkListToMarkdown(node);
    case "code_block":
      return codeBlockToMarkdown(node);
    case "image": {
      const attrs = node.attrs as { src: string; alt?: string };
      return `![${attrs.alt ?? ""}](${attrs.src})`;
    }
    case "attachment": {
      const attrs = node.attrs as { attachmentId: string; displayName: string };
      return `[[attachment:${attrs.attachmentId}|${escapeAttachmentLabel(attrs.displayName)}]]`;
    }
    default:
      throw new Error(`Cannot serialize block ${JSON.stringify(node.type)}`);
  }
}

function listToMarkdown(node: DocNode, prefix: (index: number) => string): string {
  const items = node.content ?? [];
  return items
    .map((item, idx) => {
      const itemContent = (item.content ?? []).map((b) => blockToMarkdown(b)).join("\n");
      return indentContinuation(`${prefix(idx)}${itemContent}`, prefix(idx).length);
    })
    .join("\n");
}

function checkListToMarkdown(node: DocNode): string {
  const items = node.content ?? [];
  return items
    .map((item) => {
      const checked = (item.attrs as { checked: boolean }).checked;
      const itemContent = (item.content ?? []).map((b) => blockToMarkdown(b)).join("\n");
      const marker = checked ? "- [x] " : "- [ ] ";
      return indentContinuation(`${marker}${itemContent}`, marker.length);
    })
    .join("\n");
}

function indentContinuation(text: string, indent: number): string {
  const pad = " ".repeat(indent);
  const [first = "", ...rest] = text.split("\n");
  if (rest.length === 0) return first;
  return [first, ...rest.map((l) => `${pad}${l}`)].join("\n");
}

function codeBlockToMarkdown(node: DocNode): string {
  const lang = (node.attrs as { language?: string | null } | undefined)?.language ?? "";
  const body = (node.content ?? []).map((c) => (typeof c.text === "string" ? c.text : "")).join("");
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

function inlineToMarkdown(inline: readonly DocNode[]): string {
  return inline.map(inlineNodeToMarkdown).join("");
}

function inlineNodeToMarkdown(node: DocNode): string {
  switch (node.type) {
    case "text":
      return applyMarks(escapeInline(node.text ?? ""), node.marks ?? []);
    case "code_inline":
      // Backticks inside inline code: pick the shortest run that won't clash.
      return wrapInlineCode(node.text ?? "");
    case "internal_link": {
      const attrs = node.attrs as { noteId: string; label?: string };
      const label = attrs.label !== undefined && attrs.label.length > 0 ? `|${attrs.label}` : "";
      return `[[note:${attrs.noteId}${label}]]`;
    }
    case "hard_break":
      return "  \n";
    default:
      throw new Error(`Cannot serialize inline ${JSON.stringify(node.type)}`);
  }
}

const MARK_ORDER: readonly MarkName[] = ["bold", "italic", "strike"];
const MARK_DELIM: Record<MarkName, string> = {
  bold: "**",
  italic: "_",
  strike: "~~",
};

function applyMarks(text: string, marks: readonly MarkInstance[]): string {
  const ordered = [...marks].sort(
    (a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type),
  );
  let out = text;
  for (const m of ordered) {
    const d = MARK_DELIM[m.type];
    out = `${d}${out}${d}`;
  }
  return out;
}

function wrapInlineCode(text: string): string {
  let runs = 1;
  const matches = text.match(/`+/g);
  if (matches !== null) {
    runs = Math.max(...matches.map((m) => m.length)) + 1;
  }
  const fence = "`".repeat(runs);
  // Pad with a space when the content starts/ends with a backtick to keep
  // the fence unambiguous.
  const padded = text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

function escapeInline(text: string): string {
  // Escape Markdown-significant characters in plain text.
  return text.replace(/([\\`*_~\[\]])/g, "\\$1");
}

function escapeAttachmentLabel(label: string): string {
  return label.replace(/\|/g, "\\|").replace(/]]/g, "\\]\\]");
}

// ---------- Markdown → JSON ----------

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const FENCE_RE = /^```(\S*)\s*$/;
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const CHECK_RE = /^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/;
const ATTACHMENT_BLOCK_RE = /^\[\[attachment:([^|\]]+)\|((?:\\.|[^\]])+)\]\]$/;
const IMAGE_BLOCK_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

interface Cursor {
  readonly lines: readonly string[];
  index: number;
}

export function markdownToJson(markdown: string): DocRoot {
  const cursor: Cursor = { lines: markdown.split("\n"), index: 0 };
  const blocks: DocNode[] = [];
  while (cursor.index < cursor.lines.length) {
    const line = (cursor.lines[cursor.index] ?? "").replace(/\s+$/, "");
    if (line.length === 0) {
      cursor.index += 1;
      continue;
    }
    blocks.push(parseBlock(cursor));
  }
  const doc: DocRoot = blocks.length === 0 ? emptyDoc() : { type: "doc", content: blocks };
  validateDoc(doc);
  return doc;
}

function parseBlock(cursor: Cursor): DocNode {
  const line = (cursor.lines[cursor.index] ?? "").replace(/\s+$/, "");
  const headingMatch = HEADING_RE.exec(line);
  if (headingMatch !== null) {
    cursor.index += 1;
    return {
      type: "heading",
      attrs: { level: headingMatch[1]!.length as 1 | 2 | 3 },
      content: parseInline(headingMatch[2] ?? ""),
    };
  }
  if (FENCE_RE.test(line)) {
    return parseCodeBlock(cursor);
  }
  if (IMAGE_BLOCK_RE.test(line)) {
    cursor.index += 1;
    const m = IMAGE_BLOCK_RE.exec(line)!;
    const node: DocNode = {
      type: "image",
      attrs: { src: m[2]!, ...(m[1] !== "" ? { alt: m[1]! } : {}) },
    };
    return node;
  }
  if (ATTACHMENT_BLOCK_RE.test(line)) {
    cursor.index += 1;
    const m = ATTACHMENT_BLOCK_RE.exec(line)!;
    return {
      type: "attachment",
      attrs: {
        attachmentId: m[1]!,
        displayName: unescapeAttachmentLabel(m[2]!),
      },
    };
  }
  if (CHECK_RE.test(line)) {
    return parseList(cursor, "check_list");
  }
  if (BULLET_RE.test(line)) {
    return parseList(cursor, "bullet_list");
  }
  if (ORDERED_RE.test(line)) {
    return parseList(cursor, "ordered_list");
  }
  return parseParagraph(cursor);
}

function parseCodeBlock(cursor: Cursor): DocNode {
  const fenceLine = (cursor.lines[cursor.index] ?? "").trim();
  const lang = FENCE_RE.exec(fenceLine)?.[1] ?? "";
  cursor.index += 1;
  const bodyLines: string[] = [];
  while (cursor.index < cursor.lines.length) {
    const l = cursor.lines[cursor.index] ?? "";
    if (l.trimEnd() === "```") {
      cursor.index += 1;
      break;
    }
    bodyLines.push(l);
    cursor.index += 1;
  }
  const text = bodyLines.join("\n");
  const node: DocNode = {
    type: "code_block",
    attrs: { language: lang.length === 0 ? null : lang },
    content: text.length === 0 ? [] : [{ type: "text", text }],
  };
  return node;
}

function parseList(cursor: Cursor, kind: "bullet_list" | "ordered_list" | "check_list"): DocNode {
  const items: DocNode[] = [];
  while (cursor.index < cursor.lines.length) {
    const line = (cursor.lines[cursor.index] ?? "").replace(/\s+$/, "");
    if (line.length === 0) break;
    const detected = detectListKind(line);
    if (detected !== kind) break;
    items.push(parseListItem(cursor, kind));
  }
  return { type: kind, content: items };
}

function detectListKind(line: string): "bullet_list" | "ordered_list" | "check_list" | null {
  if (CHECK_RE.test(line)) return "check_list";
  if (BULLET_RE.test(line)) return "bullet_list";
  if (ORDERED_RE.test(line)) return "ordered_list";
  return null;
}

function parseListItem(
  cursor: Cursor,
  kind: "bullet_list" | "ordered_list" | "check_list",
): DocNode {
  const line = (cursor.lines[cursor.index] ?? "").replace(/\s+$/, "");
  let rest: string;
  let checked: boolean | null = null;
  if (kind === "check_list") {
    const m = CHECK_RE.exec(line)!;
    checked = m[2]?.toLowerCase() === "x";
    rest = m[3] ?? "";
  } else if (kind === "bullet_list") {
    const m = BULLET_RE.exec(line)!;
    rest = m[2] ?? "";
  } else {
    const m = ORDERED_RE.exec(line)!;
    rest = m[3] ?? "";
  }
  cursor.index += 1;
  // Collect continuation lines (indented).
  const paragraphLines: string[] = [rest];
  while (cursor.index < cursor.lines.length) {
    const next = cursor.lines[cursor.index] ?? "";
    if (next.length === 0) break;
    if (detectListKind(next.trimStart()) !== null && next.startsWith(" ") === false) break;
    if (next.startsWith(" ")) {
      paragraphLines.push(next.replace(/^\s+/, ""));
      cursor.index += 1;
    } else {
      break;
    }
  }
  const item: DocNode = {
    type: kind === "check_list" ? "check_list_item" : "list_item",
    ...(kind === "check_list" ? { attrs: { checked: checked ?? false } } : {}),
    content: [{ type: "paragraph", content: parseInline(paragraphLines.join("\n")) }],
  };
  return item;
}

function parseParagraph(cursor: Cursor): DocNode {
  const collected: string[] = [];
  while (cursor.index < cursor.lines.length) {
    const line = (cursor.lines[cursor.index] ?? "").replace(/\s+$/, "");
    if (line.length === 0) break;
    if (
      HEADING_RE.test(line) ||
      FENCE_RE.test(line) ||
      detectListKind(line) !== null ||
      IMAGE_BLOCK_RE.test(line) ||
      ATTACHMENT_BLOCK_RE.test(line)
    ) {
      break;
    }
    collected.push(cursor.lines[cursor.index] ?? "");
    cursor.index += 1;
  }
  return { type: "paragraph", content: parseInline(collected.join("\n")) };
}

// Inline parsing — small, deterministic, intentionally not Markdown-spec
// strict. We only emit / consume what we ourselves produce; user input is
// always tunnelled through the document model.
function parseInline(text: string): DocNode[] {
  if (text.length === 0) return [];
  const nodes: DocNode[] = [];
  let pos = 0;
  let buffer = "";
  const flushText = (marks: MarkName[] = []) => {
    if (buffer.length === 0) return;
    nodes.push({
      type: "text",
      text: buffer,
      ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
    });
    buffer = "";
  };

  while (pos < text.length) {
    const c = text[pos]!;
    // Hard break: two trailing spaces before a newline.
    if (c === " " && text[pos + 1] === " " && text[pos + 2] === "\n") {
      flushText();
      nodes.push({ type: "hard_break" });
      pos += 3;
      continue;
    }
    if (c === "\\" && pos + 1 < text.length) {
      buffer += text[pos + 1]!;
      pos += 2;
      continue;
    }
    if (c === "`") {
      flushText();
      const closing = text.indexOf("`", pos + 1);
      if (closing === -1) {
        buffer += c;
        pos += 1;
        continue;
      }
      const raw = text.slice(pos + 1, closing);
      // Strip the optional padding space iff the serializer would have
      // added it — i.e. the inner content has a backtick adjacent to the
      // padding. Pure whitespace content is preserved verbatim.
      const wasPadded =
        raw.length >= 2 &&
        raw.startsWith(" ") &&
        raw.endsWith(" ") &&
        (raw[1] === "`" || raw[raw.length - 2] === "`");
      const trimmed = wasPadded ? raw.slice(1, -1) : raw;
      nodes.push({ type: "code_inline", text: trimmed });
      pos = closing + 1;
      continue;
    }
    if (c === "[" && text[pos + 1] === "[") {
      const end = text.indexOf("]]", pos + 2);
      if (end === -1) {
        buffer += c;
        pos += 1;
        continue;
      }
      const body = text.slice(pos + 2, end);
      const noteMatch = /^note:([^|]+)(?:\|(.*))?$/.exec(body);
      if (noteMatch !== null) {
        flushText();
        nodes.push({
          type: "internal_link",
          attrs: {
            noteId: noteMatch[1]!,
            ...(noteMatch[2] !== undefined && noteMatch[2].length > 0
              ? { label: noteMatch[2] }
              : {}),
          },
        });
        pos = end + 2;
        continue;
      }
      buffer += c;
      pos += 1;
      continue;
    }
    if (c === "*" && text[pos + 1] === "*") {
      const close = findMarkClose(text, pos + 2, "**");
      if (close !== -1) {
        flushText();
        nodes.push(...parseInlineMarked(text.slice(pos + 2, close), "bold"));
        pos = close + 2;
        continue;
      }
    }
    if (c === "_") {
      const close = findMarkClose(text, pos + 1, "_");
      if (close !== -1) {
        flushText();
        nodes.push(...parseInlineMarked(text.slice(pos + 1, close), "italic"));
        pos = close + 1;
        continue;
      }
    }
    if (c === "~" && text[pos + 1] === "~") {
      const close = findMarkClose(text, pos + 2, "~~");
      if (close !== -1) {
        flushText();
        nodes.push(...parseInlineMarked(text.slice(pos + 2, close), "strike"));
        pos = close + 2;
        continue;
      }
    }
    buffer += c;
    pos += 1;
  }
  flushText();
  return nodes;
}

function findMarkClose(text: string, start: number, delim: string): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text.slice(i, i + delim.length) === delim) return i;
    i += 1;
  }
  return -1;
}

function parseInlineMarked(text: string, mark: MarkName): DocNode[] {
  const inner = parseInline(text);
  return inner.map((node) => {
    if (node.type !== "text" && node.type !== "code_inline") return node;
    const existing = node.marks ?? [];
    if (existing.some((m) => m.type === mark)) return node;
    return { ...node, marks: [...existing, { type: mark }] };
  });
}

function unescapeAttachmentLabel(label: string): string {
  return label.replace(/\\\]\\\]/g, "]]").replace(/\\\|/g, "|");
}
