import { describe, expect, it, vi } from "vitest";
import {
  runValidator,
  type ProbeResult,
  type ValidatorDeps,
  type ValidatorRow,
} from "../validate.js";

function row(id: string, externalId: string, thumbnailId: string | null = null): ValidatorRow {
  return { id, external_id: externalId, thumbnail_id: thumbnailId, owner_id: "owner-1" };
}

describe("runValidator", () => {
  it("returns 0 dangling for a corpus where every row is present", async () => {
    const deps: ValidatorDeps = {
      fetchPage: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row("a", "ext-a"), row("b", "ext-b")], nextCursor: null }),
      probe: vi.fn<(externalId: string) => Promise<ProbeResult>>(async () => "present"),
      recordDangling: vi.fn(async () => {}),
    };
    const summary = await runValidator(deps);
    expect(summary).toEqual({ scanned: 2, dangling: 0, probeErrors: 0 });
    expect(deps.recordDangling).not.toHaveBeenCalled();
  });

  it("records a dangling entry when the original is missing", async () => {
    const deps: ValidatorDeps = {
      fetchPage: vi.fn().mockResolvedValueOnce({ rows: [row("a", "ext-a")], nextCursor: null }),
      probe: vi.fn<(externalId: string) => Promise<ProbeResult>>(async (id) =>
        id === "ext-a" ? "missing" : "present",
      ),
      recordDangling: vi.fn(async () => {}),
    };
    const summary = await runValidator(deps);
    expect(summary.dangling).toBe(1);
    expect(deps.recordDangling).toHaveBeenCalledWith({
      attachmentId: "a",
      ownerId: "owner-1",
      externalId: "ext-a",
      missingOriginal: true,
      missingThumbnail: false,
    });
  });

  it("flags a row with a present original and a missing thumbnail", async () => {
    const deps: ValidatorDeps = {
      fetchPage: vi
        .fn()
        .mockResolvedValueOnce({ rows: [row("a", "ext-a", "thumb-a")], nextCursor: null }),
      probe: vi.fn<(externalId: string) => Promise<ProbeResult>>(async (id) =>
        id === "thumb-a" ? "missing" : "present",
      ),
      recordDangling: vi.fn(async () => {}),
    };
    const summary = await runValidator(deps);
    expect(summary.dangling).toBe(1);
    const arg = vi.mocked(deps.recordDangling).mock.calls[0]?.[0];
    expect(arg?.missingOriginal).toBe(false);
    expect(arg?.missingThumbnail).toBe(true);
  });

  it("skips recording when the probe errors out — safe to re-run", async () => {
    const deps: ValidatorDeps = {
      fetchPage: vi.fn().mockResolvedValueOnce({ rows: [row("a", "ext-a")], nextCursor: null }),
      probe: vi.fn<(externalId: string) => Promise<ProbeResult>>(async () => "error"),
      recordDangling: vi.fn(async () => {}),
    };
    const summary = await runValidator(deps);
    expect(summary.dangling).toBe(0);
    expect(summary.probeErrors).toBe(1);
    expect(deps.recordDangling).not.toHaveBeenCalled();
  });

  it("paginates through every page until nextCursor is null", async () => {
    const pages = [
      { rows: [row("a", "ext-a")], nextCursor: "cursor-1" },
      { rows: [row("b", "ext-b")], nextCursor: "cursor-2" },
      { rows: [row("c", "ext-c")], nextCursor: null },
    ];
    let pageIdx = 0;
    const deps: ValidatorDeps = {
      fetchPage: vi.fn(async () => pages[pageIdx++]!),
      probe: vi.fn<(externalId: string) => Promise<ProbeResult>>(async () => "present"),
      recordDangling: vi.fn(async () => {}),
    };
    const summary = await runValidator(deps);
    expect(summary.scanned).toBe(3);
    expect(deps.fetchPage).toHaveBeenCalledTimes(3);
  });
});
