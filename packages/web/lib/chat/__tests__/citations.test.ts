import { describe, expect, it } from "vitest";
import { splitWithCitations, type CitationEntry } from "../citations";

function makeCitations(...entries: CitationEntry[]): Map<string, CitationEntry> {
  return new Map(entries.map((e) => [e.noteId, e]));
}

describe("splitWithCitations", () => {
  it("returns the whole text when there are no markers", () => {
    expect(splitWithCitations("hello there", new Map())).toEqual([
      { kind: "text", text: "hello there" },
    ]);
  });

  it("replaces a single marker with a citation segment", () => {
    const citations = makeCitations({ noteId: "n1", title: "Note One", rank: 1 });
    const segments = splitWithCitations("before [[NoteId:n1]] after", citations);
    expect(segments).toEqual([
      { kind: "text", text: "before " },
      { kind: "citation", noteId: "n1", title: "Note One", rank: 1 },
      { kind: "text", text: " after" },
    ]);
  });

  it("handles multiple markers in order", () => {
    const citations = makeCitations(
      { noteId: "a", title: "A", rank: 1 },
      { noteId: "b", title: "B", rank: 2 },
    );
    const segments = splitWithCitations("see [[NoteId:a]] and [[NoteId:b]].", citations);
    expect(segments.filter((s) => s.kind === "citation")).toHaveLength(2);
    expect(segments[0]).toEqual({ kind: "text", text: "see " });
    expect(segments[segments.length - 1]).toEqual({ kind: "text", text: "." });
  });

  it("falls through markers with no matching citation entry", () => {
    // The server-side guard should never emit an orphan marker, but if one
    // slips through we render it verbatim rather than crashing.
    const segments = splitWithCitations("see [[NoteId:unknown]] now", new Map());
    expect(segments).toEqual([{ kind: "text", text: "see [[NoteId:unknown]] now" }]);
  });

  it("preserves text exactly between markers", () => {
    const citations = makeCitations(
      { noteId: "a", title: "A", rank: 1 },
      { noteId: "b", title: "B", rank: 2 },
    );
    const segments = splitWithCitations("[[NoteId:a]][[NoteId:b]]", citations);
    expect(segments).toEqual([
      { kind: "citation", noteId: "a", title: "A", rank: 1 },
      { kind: "citation", noteId: "b", title: "B", rank: 2 },
    ]);
  });
});
