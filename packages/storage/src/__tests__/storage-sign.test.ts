import { describe, expect, it } from "vitest";
import { parseSignRequest, sign, type SignDeps } from "../storage-sign.js";

const USER = "550e8400-e29b-41d4-a716-446655440000";
const NOW = new Date("2026-05-22T10:00:00.000Z");

function deps(overrides: Partial<SignDeps> = {}): SignDeps {
  return {
    userOwnsAttachment: async () => true,
    mintDriveUrl: async (id) => `https://drive/file/${id}`,
    now: () => NOW,
    ...overrides,
  };
}

describe("parseSignRequest", () => {
  it("accepts an externalId without ttlSeconds", () => {
    expect(parseSignRequest({ externalId: "drive-file-abc" })).toEqual({
      externalId: "drive-file-abc",
    });
  });

  it("accepts an externalId with valid ttlSeconds", () => {
    expect(parseSignRequest({ externalId: "x", ttlSeconds: 600 })).toEqual({
      externalId: "x",
      ttlSeconds: 600,
    });
  });

  it("rejects empty externalId", () => {
    expect(parseSignRequest({ externalId: "" })).toBeNull();
  });

  it("rejects ttlSeconds outside (60, 3600)", () => {
    expect(parseSignRequest({ externalId: "x", ttlSeconds: 30 })).toBeNull();
    expect(parseSignRequest({ externalId: "x", ttlSeconds: 4000 })).toBeNull();
    expect(parseSignRequest({ externalId: "x", ttlSeconds: 1.5 })).toBeNull();
  });

  it("rejects malformed bodies", () => {
    expect(parseSignRequest(null)).toBeNull();
    expect(parseSignRequest("oops")).toBeNull();
    expect(parseSignRequest({})).toBeNull();
  });
});

describe("sign", () => {
  it("returns a signed URL with expires_at = now + ttl", async () => {
    const result = await sign(USER, { externalId: "drive-1", ttlSeconds: 600 }, deps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toBe("https://drive/file/drive-1");
      expect(result.data.expires_at).toBe("2026-05-22T10:10:00.000Z");
    }
  });

  it("defaults ttl to 300 seconds", async () => {
    const result = await sign(USER, { externalId: "drive-1" }, deps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.expires_at).toBe("2026-05-22T10:05:00.000Z");
    }
  });

  it("rejects callers without a userId (ERR_UNAUTHENTICATED)", async () => {
    const result = await sign("", { externalId: "drive-1" }, deps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_UNAUTHENTICATED");
  });

  it("rejects malformed userId (ERR_UNAUTHENTICATED)", async () => {
    const result = await sign("not-a-uuid", { externalId: "drive-1" }, deps());
    expect(result.ok).toBe(false);
  });

  it("returns ERR_NOT_FOUND for an attachment the user does not own", async () => {
    const result = await sign(
      USER,
      { externalId: "drive-1" },
      deps({ userOwnsAttachment: async () => false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_NOT_FOUND");
  });

  it("maps an upstream mint failure to ERR_UPSTREAM", async () => {
    const result = await sign(
      USER,
      { externalId: "drive-1" },
      deps({
        mintDriveUrl: async () => {
          throw new Error("Drive 503");
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ERR_UPSTREAM");
      expect(result.error.message).toContain("Drive 503");
    }
  });
});
