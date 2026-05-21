import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { jsonToMarkdown, markdownToJson } from "../markdown.js";
import { emptyDoc, type DocNode, type DocRoot, type MarkName } from "../schema.js";

// The round-trip is text-preserving but the serializer rstrips trailing
// whitespace from emitted lines and list-item regexes collapse runs of
// whitespace after the marker. The arbitrary excludes texts whose edges
// would be eaten by those rules — the editor never produces such inputs
// because cursor positions are tracked between non-whitespace tokens.
const safeText = fc.stringMatching(/^[A-Za-z0-9 ]+$/).filter((s) => s.length > 0 && s === s.trim());

const marksArb = fc
  .uniqueArray(fc.constantFrom<MarkName>("bold", "italic", "strike"), { maxLength: 3 })
  .map((arr) => arr.map((type) => ({ type })));

const textNode = fc.record({ type: fc.constant("text" as const), text: safeText, marks: marksArb });

const codeInlineNode = fc.record({
  type: fc.constant("code_inline" as const),
  text: fc.stringMatching(/^[A-Za-z0-9 +\-=*/]+$/).filter((s) => s.length > 0 && s === s.trim()),
});

const internalLinkNode = fc.record({
  type: fc.constant("internal_link" as const),
  attrs: fc.record({
    noteId: fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length > 0),
  }),
});

const inlineNode = fc.oneof(textNode, codeInlineNode, internalLinkNode) as fc.Arbitrary<DocNode>;

const inlineContent = fc.array(inlineNode, { minLength: 1, maxLength: 4 });

const paragraphNode = fc.record({
  type: fc.constant("paragraph" as const),
  content: inlineContent,
}) as fc.Arbitrary<DocNode>;

const headingNode = fc.record({
  type: fc.constant("heading" as const),
  attrs: fc.record({ level: fc.constantFrom<1 | 2 | 3>(1, 2, 3) }),
  content: inlineContent,
}) as fc.Arbitrary<DocNode>;

const listItemNode = fc.record({
  type: fc.constant("list_item" as const),
  // V1 keeps list items single-paragraph — multi-paragraph items would
  // require Markdown lazy-line continuation that our small parser does
  // not support. The schema permits more; the round-trip guarantee is
  // scoped to what the editor actually produces.
  content: fc.array(paragraphNode, { minLength: 1, maxLength: 1 }),
}) as fc.Arbitrary<DocNode>;

const checkListItemNode = fc.record({
  type: fc.constant("check_list_item" as const),
  attrs: fc.record({ checked: fc.boolean() }),
  content: fc.array(paragraphNode, { minLength: 1, maxLength: 1 }),
}) as fc.Arbitrary<DocNode>;

const bulletListNode = fc.record({
  type: fc.constant("bullet_list" as const),
  content: fc.array(listItemNode, { minLength: 1, maxLength: 3 }),
}) as fc.Arbitrary<DocNode>;

const orderedListNode = fc.record({
  type: fc.constant("ordered_list" as const),
  content: fc.array(listItemNode, { minLength: 1, maxLength: 3 }),
}) as fc.Arbitrary<DocNode>;

const checkListNode = fc.record({
  type: fc.constant("check_list" as const),
  content: fc.array(checkListItemNode, { minLength: 1, maxLength: 3 }),
}) as fc.Arbitrary<DocNode>;

const codeBlockNode = fc.record({
  type: fc.constant("code_block" as const),
  attrs: fc.record({ language: fc.option(fc.constantFrom("js", "ts", "py"), { nil: null }) }),
  content: fc
    .array(fc.stringMatching(/^[A-Za-z0-9 +\-=]*$/), { minLength: 1, maxLength: 3 })
    .map((lines) => [{ type: "text" as const, text: lines.join("\n") }])
    .filter((arr) => (arr[0]?.text ?? "").length > 0),
}) as fc.Arbitrary<DocNode>;

const blockNode = fc.oneof(
  paragraphNode,
  headingNode,
  bulletListNode,
  orderedListNode,
  checkListNode,
  codeBlockNode,
);

const docArb: fc.Arbitrary<DocRoot> = fc
  .array(blockNode, { minLength: 1, maxLength: 5 })
  .map((content) => ({ type: "doc" as const, content }));

function normalise(doc: DocRoot): DocRoot {
  // Round-tripping merges adjacent text nodes inside paragraphs and drops
  // empty-mark arrays. Apply the same merge before comparing so the
  // property test cares about content, not serialization quirks.
  return walk(doc) as DocRoot;
}

function walk(node: DocNode): DocNode {
  const children = (node.content ?? []).map(walk);
  const merged: DocNode[] = [];
  for (const child of children) {
    const prev = merged[merged.length - 1];
    if (
      prev !== undefined &&
      prev.type === "text" &&
      child.type === "text" &&
      sameMarks(prev.marks, child.marks)
    ) {
      merged[merged.length - 1] = {
        ...prev,
        text: `${prev.text ?? ""}${child.text ?? ""}`,
      };
    } else {
      merged.push(child);
    }
  }
  // Canonicalise marks order — the serializer emits them sorted by
  // MARK_ORDER, but the parser builds them inside-out, so the resulting
  // order differs even though the rendered output is identical.
  const sortedMarks =
    node.marks !== undefined && node.marks.length > 0
      ? [...node.marks].sort((a, b) => a.type.localeCompare(b.type))
      : undefined;
  const stripped: DocNode = {
    type: node.type,
    ...(node.attrs !== undefined ? { attrs: node.attrs } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(sortedMarks !== undefined ? { marks: sortedMarks } : {}),
    ...(merged.length > 0 ? { content: merged } : {}),
  };
  return stripped;
}

function sameMarks(
  a: readonly { type: string }[] | undefined,
  b: readonly { type: string }[] | undefined,
): boolean {
  const aa = (a ?? []).map((m) => m.type).sort();
  const bb = (b ?? []).map((m) => m.type).sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

describe("markdown round-trip — fixed cases", () => {
  it("preserves a single paragraph", () => {
    const md = jsonToMarkdown({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }],
    });
    expect(md).toBe("hello world");
    expect(markdownToJson(md)).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }],
    });
  });

  it("preserves headings", () => {
    const doc: DocRoot = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
      ],
    };
    expect(jsonToMarkdown(doc)).toBe("## Title");
    expect(markdownToJson("## Title")).toEqual(doc);
  });

  it("preserves a check list", () => {
    const doc: DocRoot = {
      type: "doc",
      content: [
        {
          type: "check_list",
          content: [
            {
              type: "check_list_item",
              attrs: { checked: true },
              content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }],
            },
            {
              type: "check_list_item",
              attrs: { checked: false },
              content: [{ type: "paragraph", content: [{ type: "text", text: "todo" }] }],
            },
          ],
        },
      ],
    };
    const md = jsonToMarkdown(doc);
    expect(md).toContain("- [x] done");
    expect(md).toContain("- [ ] todo");
    expect(markdownToJson(md)).toEqual(doc);
  });

  it("preserves a fenced code block with language", () => {
    const doc: DocRoot = {
      type: "doc",
      content: [
        {
          type: "code_block",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(jsonToMarkdown(doc)).toBe("```ts\nconst x = 1;\n```");
    expect(markdownToJson("```ts\nconst x = 1;\n```")).toEqual(doc);
  });

  it("preserves an internal link", () => {
    const doc: DocRoot = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "see " },
            { type: "internal_link", attrs: { noteId: "abc-123" } },
          ],
        },
      ],
    };
    expect(jsonToMarkdown(doc)).toBe("see [[note:abc-123]]");
    expect(markdownToJson("see [[note:abc-123]]")).toEqual(doc);
  });

  it("preserves an attachment block", () => {
    const doc: DocRoot = {
      type: "doc",
      content: [
        {
          type: "attachment",
          attrs: { attachmentId: "att-1", displayName: "spec.pdf" },
        },
      ],
    };
    expect(jsonToMarkdown(doc)).toBe("[[attachment:att-1|spec.pdf]]");
    expect(markdownToJson("[[attachment:att-1|spec.pdf]]")).toEqual(doc);
  });

  it("renders an empty markdown string to an empty doc", () => {
    expect(markdownToJson("")).toEqual(emptyDoc());
  });
});

describe("markdown round-trip — property-based", () => {
  it("any well-formed doc round-trips json -> md -> json", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const md = jsonToMarkdown(doc);
        const parsed = markdownToJson(md);
        expect(normalise(parsed)).toEqual(normalise(doc));
      }),
      { numRuns: 75 },
    );
  });
});
