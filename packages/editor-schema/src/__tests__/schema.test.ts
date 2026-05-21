import { describe, expect, it } from "vitest";
import {
  BLOCK_NODE_NAMES,
  INLINE_NODE_NAMES,
  MARK_NAMES,
  SCHEMA_VERSION,
  emptyDoc,
  isDocRoot,
} from "../schema.js";

describe("schema catalogue", () => {
  it("freezes the block-level node set", () => {
    expect([...BLOCK_NODE_NAMES]).toEqual([
      "paragraph",
      "heading",
      "bullet_list",
      "ordered_list",
      "check_list",
      "code_block",
      "image",
      "attachment",
    ]);
  });

  it("freezes the inline node set", () => {
    expect([...INLINE_NODE_NAMES]).toEqual(["text", "code_inline", "internal_link", "hard_break"]);
  });

  it("freezes the mark set", () => {
    expect([...MARK_NAMES]).toEqual(["bold", "italic", "strike"]);
  });

  it("pins SCHEMA_VERSION to 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe("emptyDoc", () => {
  it("returns a doc with a single empty paragraph", () => {
    const doc = emptyDoc();
    expect(isDocRoot(doc)).toBe(true);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("isDocRoot", () => {
  it("rejects non-doc shapes", () => {
    expect(isDocRoot(null)).toBe(false);
    expect(isDocRoot({ type: "paragraph", content: [] })).toBe(false);
    expect(isDocRoot({ type: "doc" })).toBe(false);
  });
});
