import { describe, expect, it } from "vitest";
import { ThumbnailSpec, UploadState, isThumbnailable, progress } from "../attachment-pipeline.js";

describe("UploadState smart constructors", () => {
  it("Pending / Uploading / Done are zero-arg singletons", () => {
    expect(UploadState.pending()).toEqual({ kind: "Pending" });
    expect(UploadState.uploading()).toEqual({ kind: "Uploading" });
    expect(UploadState.done()).toEqual({ kind: "Done" });
  });

  it("Failed carries a non-blank message", () => {
    const state = UploadState.failed("Drive 503");
    if (state.kind !== "Failed") throw new Error("expected Failed");
    expect(state.message).toBe("Drive 503");
  });

  it("Failed rejects a blank message", () => {
    expect(() => UploadState.failed("  ")).toThrow(/cannot be empty/);
  });
});

describe("progress factory", () => {
  it("accepts a sane progress tuple", () => {
    expect(progress(1024, 2048, UploadState.uploading())).toEqual({
      bytesSent: 1024,
      bytesTotal: 2048,
      state: { kind: "Uploading" },
    });
  });

  it("rejects negative bytesSent", () => {
    expect(() => progress(-1, 10, UploadState.uploading())).toThrow(/bytesSent/);
  });

  it("rejects non-integer values", () => {
    expect(() => progress(1.5, 10, UploadState.uploading())).toThrow(/bytesSent/);
  });

  it("rejects bytesSent > bytesTotal", () => {
    expect(() => progress(11, 10, UploadState.uploading())).toThrow(/<= bytesTotal/);
  });
});

describe("ThumbnailSpec", () => {
  it("pins the shared dimensions", () => {
    expect(ThumbnailSpec.maxLongestEdgePx).toBe(800);
    expect(ThumbnailSpec.jpegQuality).toBe(80);
  });

  it("lists the image MIME types we generate thumbnails for", () => {
    expect([...ThumbnailSpec.thumbnailMimeTypes]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
  });
});

describe("isThumbnailable", () => {
  it("accepts every listed image type", () => {
    for (const mime of ThumbnailSpec.thumbnailMimeTypes) {
      expect(isThumbnailable(mime)).toBe(true);
    }
  });

  it("rejects non-image MIME types", () => {
    expect(isThumbnailable("application/pdf")).toBe(false);
    expect(isThumbnailable("text/plain")).toBe(false);
  });
});
