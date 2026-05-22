import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_OVERLAP_WORDS,
  DEFAULT_CHUNK_WORDS,
  chunkText,
  plainTextFromProseMirror,
} from "../chunker.js";

describe("chunkText", () => {
  it("returns empty for empty / whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk when the text fits in one window", () => {
    const text = "alpha beta gamma";
    expect(chunkText(text)).toEqual([{ index: 0, text }]);
  });

  it("emits the expected count for 1500 tokens (3 chunks at 500/50 overlap)", () => {
    const words = Array.from({ length: 1500 }, (_, i) => `w${i}`).join(" ");
    const out = chunkText(words);
    expect(out.length).toBe(
      Math.ceil(
        (1500 - DEFAULT_CHUNK_OVERLAP_WORDS) / (DEFAULT_CHUNK_WORDS - DEFAULT_CHUNK_OVERLAP_WORDS),
      ),
    );
    // 1500 words → step=450 → starts at 0, 450, 900, 1350. The last
    // window slices to the array end, so 4 windows total.
    expect(out.length).toBe(4);
    expect(out[0]?.index).toBe(0);
    expect(out[1]?.index).toBe(1);
  });

  it("preserves an overlap of `overlapWords` between consecutive chunks", () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
    const out = chunkText(words, { chunkWords: 30, overlapWords: 5 });
    const first = out[0]?.text.split(" ") ?? [];
    const second = out[1]?.text.split(" ") ?? [];
    const tail = first.slice(-5);
    const head = second.slice(0, 5);
    expect(tail).toEqual(head);
  });

  it("rejects nonsense options", () => {
    expect(() => chunkText("hi", { chunkWords: 0 })).toThrow();
    expect(() => chunkText("hi", { overlapWords: -1 })).toThrow();
    expect(() => chunkText("hi", { chunkWords: 5, overlapWords: 5 })).toThrow();
  });
});

describe("plainTextFromProseMirror", () => {
  it("extracts text from paragraphs and headings", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    expect(plainTextFromProseMirror(JSON.stringify(doc))).toBe("Title Hello world");
  });

  it("ignores unknown shapes safely", () => {
    expect(plainTextFromProseMirror("not-json")).toBe("");
    expect(plainTextFromProseMirror(JSON.stringify({}))).toBe("");
  });

  it("collapses runs of whitespace", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "foo  bar\n\nbaz" }] }],
    };
    expect(plainTextFromProseMirror(JSON.stringify(doc))).toBe("foo bar baz");
  });
});
