import { describe, expect, it, vi } from "vitest";
import { bulkUpdate, parseBulkUpdate, type BulkUpdateDeps } from "../bulk-update.js";

const UUID = "550e8400-e29b-41d4-a716-446655440001";
const UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const TAG = "550e8400-e29b-41d4-a716-446655440003";

describe("parseBulkUpdate", () => {
  it("accepts a trash request", () => {
    expect(parseBulkUpdate({ noteIds: [UUID], operation: { kind: "trash" } })).toEqual({
      noteIds: [UUID],
      operation: { kind: "trash" },
    });
  });

  it("accepts a move-to-null request", () => {
    expect(
      parseBulkUpdate({ noteIds: [UUID], operation: { kind: "move", notebookId: null } }),
    ).toEqual({ noteIds: [UUID], operation: { kind: "move", notebookId: null } });
  });

  it("accepts addTag with a UUID", () => {
    expect(
      parseBulkUpdate({ noteIds: [UUID, UUID_2], operation: { kind: "addTag", tagId: TAG } }),
    ).toEqual({ noteIds: [UUID, UUID_2], operation: { kind: "addTag", tagId: TAG } });
  });

  it("rejects an empty noteIds array", () => {
    expect(parseBulkUpdate({ noteIds: [], operation: { kind: "trash" } })).toBeNull();
  });

  it("rejects more than 500 ids", () => {
    const ids = Array.from({ length: 501 }, () => UUID);
    expect(parseBulkUpdate({ noteIds: ids, operation: { kind: "trash" } })).toBeNull();
  });

  it("rejects a non-UUID id", () => {
    expect(parseBulkUpdate({ noteIds: ["nope"], operation: { kind: "trash" } })).toBeNull();
  });

  it("rejects an unknown operation kind", () => {
    expect(parseBulkUpdate({ noteIds: [UUID], operation: { kind: "explode" } })).toBeNull();
  });

  it("rejects addTag without a tagId", () => {
    expect(parseBulkUpdate({ noteIds: [UUID], operation: { kind: "addTag" } })).toBeNull();
  });

  it("rejects malformed bodies", () => {
    expect(parseBulkUpdate(null)).toBeNull();
    expect(parseBulkUpdate("oops")).toBeNull();
  });
});

describe("bulkUpdate", () => {
  it("rejects callers without a userId", async () => {
    const execute = vi.fn();
    const result = await bulkUpdate("", { noteIds: [UUID], operation: { kind: "trash" } }, {
      execute,
    } satisfies BulkUpdateDeps);
    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns the executor's count on success", async () => {
    const execute = vi.fn(async () => 3);
    const result = await bulkUpdate(
      "user-1",
      { noteIds: [UUID, UUID_2], operation: { kind: "trash" } },
      { execute } satisfies BulkUpdateDeps,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.updated).toBe(3);
  });

  it("maps executor failure to ERR_BULK_UPDATE_FAILED", async () => {
    const execute = vi.fn(async () => {
      throw new Error("constraint violation");
    });
    const result = await bulkUpdate("user-1", { noteIds: [UUID], operation: { kind: "trash" } }, {
      execute,
    } satisfies BulkUpdateDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ERR_BULK_UPDATE_FAILED");
      expect(result.error.message).toContain("constraint violation");
    }
  });
});
