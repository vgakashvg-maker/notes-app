import { describe, expect, it } from "vitest";
import { makeNotebook, type Notebook } from "../notebook.js";
import { NotebookId, UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const ID = NotebookId("550e8400-e29b-41d4-a716-446655440002");

function base(overrides: Partial<Notebook> = {}): Notebook {
  return {
    id: ID,
    ownerId: OWNER,
    name: "Inbox",
    color: "#aabbcc",
    sortOrder: 0,
    createdAt: "2026-05-20T12:00:00.000Z",
    updatedAt: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("makeNotebook", () => {
  it("accepts a valid notebook", () => {
    expect(makeNotebook(base()).name).toBe("Inbox");
  });

  it("rejects a blank name", () => {
    expect(() => makeNotebook(base({ name: " " }))).toThrow(/name/);
  });

  it("rejects malformed colors", () => {
    expect(() => makeNotebook(base({ color: "blue" }))).toThrow(/color/);
  });

  it("rejects negative sort order", () => {
    expect(() => makeNotebook(base({ sortOrder: -1 }))).toThrow(/sortOrder/);
  });

  it("rejects non-integer sort order", () => {
    expect(() => makeNotebook(base({ sortOrder: 1.5 }))).toThrow(/sortOrder/);
  });
});
