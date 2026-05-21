import { describe, expect, it } from "vitest";
import { makeTag, type Tag } from "../tag.js";
import { TagId, UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const TAG = TagId("550e8400-e29b-41d4-a716-446655440003");

function base(overrides: Partial<Tag> = {}): Tag {
  return {
    id: TAG,
    ownerId: OWNER,
    name: "work",
    color: "#112233",
    createdAt: "2026-05-20T12:00:00.000Z",
    updatedAt: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("makeTag", () => {
  it("accepts a valid tag", () => {
    expect(makeTag(base()).name).toBe("work");
  });

  it("rejects a blank name", () => {
    expect(() => makeTag(base({ name: "" }))).toThrow(/name/);
  });

  it("rejects a malformed color", () => {
    expect(() => makeTag(base({ color: "#xyz" }))).toThrow(/color/);
  });
});
