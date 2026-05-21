import { describe, expect, it } from "vitest";
import { validateDoc } from "../validate.js";

describe("validateDoc", () => {
  it("accepts a minimal valid doc", () => {
    expect(() => validateDoc({ type: "doc", content: [{ type: "paragraph" }] })).not.toThrow();
  });

  it("rejects non-doc top-level types", () => {
    expect(() => validateDoc({ type: "paragraph", content: [] })).toThrow(/doc\.type/);
  });

  it("rejects unknown block nodes", () => {
    expect(() => validateDoc({ type: "doc", content: [{ type: "blockquote" }] })).toThrow(
      /unknown block/,
    );
  });

  it("rejects headings without a valid level", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 4 }, content: [] }],
      }),
    ).toThrow(/heading\.attrs\.level/);
  });

  it("rejects lists with mismatched item types", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [
              {
                type: "check_list_item",
                attrs: { checked: false },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/expected list_item/);
  });

  it("rejects check_list items without a boolean checked attr", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          {
            type: "check_list",
            content: [{ type: "check_list_item", content: [{ type: "paragraph" }] }],
          },
        ],
      }),
    ).toThrow(/checked must be a boolean/);
  });

  it("rejects code_block content with non-text nodes", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          { type: "code_block", attrs: { language: "js" }, content: [{ type: "paragraph" }] },
        ],
      }),
    ).toThrow(/text nodes/);
  });

  it("rejects marks on text inside code_block", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          {
            type: "code_block",
            attrs: { language: "js" },
            content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }],
          },
        ],
      }),
    ).toThrow(/marks are not allowed/);
  });

  it("rejects empty text nodes", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
      }),
    ).toThrow(/text nodes need/);
  });

  it("rejects unknown marks", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "underline" }] }],
          },
        ],
      }),
    ).toThrow(/unknown mark/);
  });

  it("rejects duplicate marks on the same text node", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "bold" }, { type: "bold" }] }],
          },
        ],
      }),
    ).toThrow(/duplicate mark/);
  });

  it("rejects image nodes without a src", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [{ type: "image", attrs: { alt: "x" } }],
      }),
    ).toThrow(/image\.attrs\.src/);
  });

  it("rejects attachment nodes missing attachmentId or displayName", () => {
    expect(() =>
      validateDoc({
        type: "doc",
        content: [{ type: "attachment", attrs: { attachmentId: "a" } }],
      }),
    ).toThrow(/displayName/);
  });
});
