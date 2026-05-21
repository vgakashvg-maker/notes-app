import { describe, expect, it } from "vitest";
import { AttachmentId, NoteId, NotebookId, TagId, UserId } from "../ids.js";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("branded ID constructors", () => {
  it.each([
    ["UserId", UserId],
    ["NotebookId", NotebookId],
    ["TagId", TagId],
    ["NoteId", NoteId],
    ["AttachmentId", AttachmentId],
  ] as const)("%s accepts a valid UUID and returns the same raw string", (_, ctor) => {
    expect(ctor(VALID_UUID)).toBe(VALID_UUID);
  });

  it("rejects empty strings", () => {
    expect(() => UserId("")).toThrow(/cannot be empty/);
  });

  it("rejects non-UUID strings", () => {
    expect(() => NoteId("not-a-uuid")).toThrow(/must be a UUID/);
  });

  it("rejects UUIDs with the wrong version nibble", () => {
    // Version nibble is the first hex of the third group; '6' is invalid (v1-5 only).
    expect(() => NoteId("550e8400-e29b-61d4-a716-446655440000")).toThrow(/must be a UUID/);
  });
});
