import { describe, expect, it } from "vitest";
import { makeNote, type Note } from "../note.js";
import { NoteId, NotebookId, TagId, UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const NOTE = NoteId("550e8400-e29b-41d4-a716-446655440001");
const NOTEBOOK = NotebookId("550e8400-e29b-41d4-a716-446655440002");
const TAG = TagId("550e8400-e29b-41d4-a716-446655440003");

function baseInput(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE,
    ownerId: OWNER,
    notebookId: NOTEBOOK,
    title: "Welcome",
    bodyJson: '{"type":"doc","content":[]}',
    tags: new Set([TAG]),
    createdAt: "2026-05-20T12:00:00.000Z",
    updatedAt: "2026-05-20T12:00:00.000Z",
    isPinned: false,
    isTrashed: false,
    trashedAt: null,
    aiExcluded: false,
    attachmentRefs: [],
    ...overrides,
  };
}

describe("makeNote", () => {
  it("returns the input on a valid note", () => {
    const note = makeNote(baseInput());
    expect(note.title).toBe("Welcome");
    expect(note.tags.has(TAG)).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(() => makeNote(baseInput({ title: "   " }))).toThrow(/title/);
  });

  it("rejects invalid JSON in bodyJson", () => {
    expect(() => makeNote(baseInput({ bodyJson: "not json" }))).toThrow(/valid JSON/);
  });

  it("rejects timestamps that aren't ISO-8601", () => {
    expect(() => makeNote(baseInput({ createdAt: "yesterday" }))).toThrow(/ISO-8601/);
  });

  it("requires trashedAt when isTrashed is true", () => {
    expect(() => makeNote(baseInput({ isTrashed: true, trashedAt: null }))).toThrow(
      /trashedAt must be set/,
    );
  });

  it("requires trashedAt to be null when isTrashed is false", () => {
    expect(() =>
      makeNote(baseInput({ isTrashed: false, trashedAt: "2026-05-20T12:00:00.000Z" })),
    ).toThrow(/must be null/);
  });
});
