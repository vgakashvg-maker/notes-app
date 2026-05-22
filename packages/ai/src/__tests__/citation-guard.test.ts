import { describe, expect, it } from "vitest";
import { CitationGuard, type VectorHit } from "../rag-pipeline.js";
import { NoteId } from "@notes-app/domain";

const ID_A = "550e8400-e29b-41d4-a716-446655440001";
const ID_B = "550e8400-e29b-41d4-a716-446655440002";
const HALLUCINATED = "550e8400-e29b-41d4-a716-446655449999";

function hit(id: string, chunkIndex = 0): VectorHit {
  return {
    noteId: NoteId(id),
    chunkIndex,
    content: "snippet",
    distance: 0.1,
  };
}

function consumeAll(guard: CitationGuard, ...deltas: string[]) {
  const events = [];
  for (const d of deltas) {
    for (const evt of guard.consume(d)) events.push(evt);
  }
  for (const evt of guard.flush()) events.push(evt);
  return events;
}

describe("CitationGuard", () => {
  it("passes through valid citation + emits a citation event", () => {
    const hits = [hit(ID_A)];
    const titles = { [ID_A]: "Tax 2026" };
    const guard = new CitationGuard(new Set([ID_A]), hits, titles);
    const events = consumeAll(guard, `Your tax appointment is March 14 [[NoteId:${ID_A}]].`);
    const deltas = events
      .filter((e) => e.kind === "delta")
      .map((e) => e.delta)
      .join("");
    expect(deltas).toBe(`Your tax appointment is March 14 [[NoteId:${ID_A}]].`);
    const citation = events.find((e) => e.kind === "citation");
    expect(citation).toBeDefined();
    expect(citation?.noteId).toBe(ID_A);
    expect(citation?.title).toBe("Tax 2026");
  });

  it("strips hallucinated citation and emits a warning instead", () => {
    const hits = [hit(ID_A)];
    const titles = { [ID_A]: "Tax 2026" };
    const guard = new CitationGuard(new Set([ID_A]), hits, titles);
    const events = consumeAll(guard, `Answer [[NoteId:${HALLUCINATED}]] continues.`);
    const deltas = events
      .filter((e) => e.kind === "delta")
      .map((e) => e.delta)
      .join("");
    expect(deltas).toBe("Answer  continues.");
    expect(events.some((e) => e.kind === "warning")).toBe(true);
    expect(events.some((e) => e.kind === "citation")).toBe(false);
  });

  it("emits only ONE citation event when the same UUID appears twice", () => {
    const hits = [hit(ID_A)];
    const titles = { [ID_A]: "Tax 2026" };
    const guard = new CitationGuard(new Set([ID_A]), hits, titles);
    const events = consumeAll(
      guard,
      `First [[NoteId:${ID_A}]] and second [[NoteId:${ID_A}]] reference.`,
    );
    const citations = events.filter((e) => e.kind === "citation");
    expect(citations).toHaveLength(1);
  });

  it("handles a marker split across delta boundaries", () => {
    const hits = [hit(ID_A)];
    const titles = { [ID_A]: "Tax 2026" };
    const guard = new CitationGuard(new Set([ID_A]), hits, titles);
    // The model emits the marker character-by-character.
    const events = consumeAll(guard, "Answer ", "[[Note", "Id:", ID_A, "]]", ".");
    const deltas = events
      .filter((e) => e.kind === "delta")
      .map((e) => e.delta)
      .join("");
    expect(deltas).toBe(`Answer [[NoteId:${ID_A}]].`);
    expect(events.filter((e) => e.kind === "citation")).toHaveLength(1);
  });

  it("strips an incomplete marker at the end of stream", () => {
    const hits = [hit(ID_A)];
    const titles = { [ID_A]: "Tax 2026" };
    const guard = new CitationGuard(new Set([ID_A]), hits, titles);
    const events = consumeAll(guard, `Answer [[NoteId:${ID_A}`);
    const deltas = events
      .filter((e) => e.kind === "delta")
      .map((e) => e.delta)
      .join("");
    // The unterminated marker is dropped.
    expect(deltas).toBe("Answer ");
  });

  it("tracks distinct citations and assigns rank in emission order", () => {
    const hits = [hit(ID_A), hit(ID_B, 5)];
    const titles = { [ID_A]: "First", [ID_B]: "Second" };
    const guard = new CitationGuard(new Set([ID_A, ID_B]), hits, titles);
    const events = consumeAll(guard, `Foo [[NoteId:${ID_B}]] bar [[NoteId:${ID_A}]] baz.`);
    const citations = events.filter((e) => e.kind === "citation");
    expect(citations.map((c) => c.noteId)).toEqual([ID_B, ID_A]);
    expect(citations.map((c) => c.rank)).toEqual([0, 1]);
  });
});
