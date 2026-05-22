import { describe, expect, it } from "vitest";
import { SIMPLE_UPLOAD_THRESHOLD_BYTES, StorageError, StorageException } from "../storage.js";

describe("StorageError smart constructors", () => {
  it("Unauthorized carries the message", () => {
    const err = StorageError.unauthorized("Token expired");
    expect(err).toEqual({ kind: "Unauthorized", message: "Token expired" });
  });

  it("QuotaExceeded carries the message", () => {
    expect(StorageError.quotaExceeded("Out of space").kind).toBe("QuotaExceeded");
  });

  it("UpstreamError carries the status code", () => {
    const err = StorageError.upstream(503, "Backend down");
    expect(err).toEqual({ kind: "UpstreamError", status: 503, message: "Backend down" });
  });

  it("TransportError and NotFound round-trip", () => {
    expect(StorageError.transport("DNS failure").kind).toBe("TransportError");
    expect(StorageError.notFound("Gone").kind).toBe("NotFound");
  });
});

describe("StorageException", () => {
  it("wraps a StorageError and exposes both .error and .message", () => {
    const ex = new StorageException(StorageError.quotaExceeded("Out of Drive space"));
    expect(ex.error.kind).toBe("QuotaExceeded");
    expect(ex.message).toBe("[QuotaExceeded] Out of Drive space");
    expect(ex.code).toBe("ERR_STORAGE");
  });
});

describe("SIMPLE_UPLOAD_THRESHOLD_BYTES", () => {
  it("matches the Drive resumable-upload cutover at 5 MB", () => {
    expect(SIMPLE_UPLOAD_THRESHOLD_BYTES).toBe(5 * 1024 * 1024);
  });
});
