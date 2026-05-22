import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIMPLE_UPLOAD_THRESHOLD_BYTES, StorageError, StorageException } from "@notes-app/domain";
import { GoogleDriveAdapter } from "../google-drive-adapter.js";
import type { DriveHttpClient, DriveListMatch, ResumableUploadHandle } from "../drive-http.js";

const ZERO_DELAY = {
  maxAttempts: 3,
  baseDelayMs: 0,
  maxDelayMs: 0,
  delay: async () => {},
  random: () => 0,
};

function makeHttp(overrides: Partial<DriveHttpClient> = {}): DriveHttpClient {
  return {
    findAppFolder: vi.fn(async () => null),
    createFolder: vi.fn(async () => "folder-xyz"),
    simpleUpload: vi.fn(async () => sampleMatch("file-1", 4)),
    startResumableUpload: vi.fn(
      async () => ({ sessionUri: "https://drive/session" }) as ResumableUploadHandle,
    ),
    putChunk: vi.fn(async () => null),
    getMetadata: vi.fn(async () => sampleMatch("file-1", 1024)),
    delete: vi.fn(async () => {}),
    ...overrides,
  };
}

function sampleMatch(id: string, size: number): DriveListMatch {
  return { id, name: "spec.pdf", mimeType: "application/pdf", size };
}

describe("ensureAppFolder", () => {
  it("creates the folder when none exists, then caches the id", async () => {
    const http = makeHttp();
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    const id1 = await adapter.ensureAppFolder();
    const id2 = await adapter.ensureAppFolder();
    expect(id1).toBe("folder-xyz");
    expect(id2).toBe("folder-xyz");
    expect(http.findAppFolder).toHaveBeenCalledTimes(1);
    expect(http.createFolder).toHaveBeenCalledTimes(1);
  });

  it("returns the pre-existing folder id without creating a duplicate", async () => {
    const http = makeHttp({ findAppFolder: vi.fn(async () => "folder-existing") });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    expect(await adapter.ensureAppFolder()).toBe("folder-existing");
    expect(http.createFolder).not.toHaveBeenCalled();
  });

  it("rejects when no token is available", async () => {
    const adapter = new GoogleDriveAdapter({
      http: makeHttp(),
      token: async () => null,
      backoff: ZERO_DELAY,
    });
    await expect(adapter.ensureAppFolder()).rejects.toBeInstanceOf(StorageException);
  });
});

describe("upload — small file path", () => {
  let adapter: GoogleDriveAdapter;
  let http: DriveHttpClient;

  beforeEach(() => {
    http = makeHttp();
    adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
  });

  it("uses simpleUpload for files under the threshold", async () => {
    const file = await adapter.upload({
      bytes: new Uint8Array([1, 2, 3, 4]),
      name: "small.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });
    expect(http.simpleUpload).toHaveBeenCalledTimes(1);
    expect(http.startResumableUpload).not.toHaveBeenCalled();
    expect(file.externalId).toBe("file-1");
  });

  it("refuses simple upload when only a stream is provided", async () => {
    await expect(
      adapter.upload({
        stream: async function* () {
          yield new Uint8Array(4);
        },
        name: "small.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
      }),
    ).rejects.toThrow(/file\.bytes/);
  });
});

describe("upload — resumable path", () => {
  it("PUTs every chunk and returns the final metadata", async () => {
    const http = makeHttp({
      // First two chunks return null; the last one returns metadata.
      putChunk: vi.fn(async (uri, chunk, start, total) => {
        const end = start + chunk.byteLength;
        if (end === total) return sampleMatch("file-resumable", total);
        return null;
      }),
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    const oneChunk = new Uint8Array(SIMPLE_UPLOAD_THRESHOLD_BYTES + 16);
    const file = await adapter.upload({
      stream: async function* () {
        // Single yield equal in size to the file — the adapter splits
        // internally into 8 MB chunks.
        yield oneChunk;
      },
      name: "big.bin",
      mimeType: "application/octet-stream",
      sizeBytes: oneChunk.byteLength,
    });
    expect(http.startResumableUpload).toHaveBeenCalledTimes(1);
    expect(http.putChunk).toHaveBeenCalled();
    expect(file.sizeBytes).toBe(oneChunk.byteLength);
  });

  it("throws when the stream delivers fewer bytes than advertised", async () => {
    const http = makeHttp({
      putChunk: vi.fn(async () => null), // never returns final metadata
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    const promise = adapter.upload({
      stream: async function* () {
        yield new Uint8Array(SIMPLE_UPLOAD_THRESHOLD_BYTES + 1);
      },
      name: "short.bin",
      mimeType: "application/octet-stream",
      sizeBytes: SIMPLE_UPLOAD_THRESHOLD_BYTES + 64, // claims more than streamed
    });
    await expect(promise).rejects.toBeInstanceOf(StorageException);
  });
});

describe("getDownloadUrl", () => {
  it("embeds the access token and returns a Drive media URL", async () => {
    const http = makeHttp();
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    const url = await adapter.getDownloadUrl("file-abc");
    expect(url).toContain("file-abc");
    expect(url).toContain("access_token=ya29.token");
    expect(http.getMetadata).toHaveBeenCalledTimes(1);
  });

  it("rejects ttl outside (0, 3600]", async () => {
    const adapter = new GoogleDriveAdapter({
      http: makeHttp(),
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await expect(adapter.getDownloadUrl("file-abc", 0)).rejects.toBeInstanceOf(StorageException);
    await expect(adapter.getDownloadUrl("file-abc", 4000)).rejects.toBeInstanceOf(StorageException);
  });

  it("rejects empty externalId", async () => {
    const adapter = new GoogleDriveAdapter({
      http: makeHttp(),
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await expect(adapter.getDownloadUrl("  ")).rejects.toBeInstanceOf(StorageException);
  });
});

describe("retry on 5xx / 429", () => {
  it("retries simple upload until success", async () => {
    let attempts = 0;
    const http = makeHttp({
      simpleUpload: vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new StorageException(StorageError.upstream(503, "Service Unavailable"));
        }
        return sampleMatch("file-retry", 4);
      }),
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    const file = await adapter.upload({
      bytes: new Uint8Array(4),
      name: "f.bin",
      mimeType: "application/octet-stream",
      sizeBytes: 4,
    });
    expect(file.externalId).toBe("file-retry");
    expect(attempts).toBe(3);
  });

  it("does NOT retry on 401 — surfaces Unauthorized immediately", async () => {
    let attempts = 0;
    const http = makeHttp({
      simpleUpload: vi.fn(async () => {
        attempts += 1;
        throw new StorageException(StorageError.unauthorized("Token expired"));
      }),
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await expect(
      adapter.upload({
        bytes: new Uint8Array(4),
        name: "f.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 4,
      }),
    ).rejects.toBeInstanceOf(StorageException);
    expect(attempts).toBe(1);
  });

  it("gives up after maxAttempts", async () => {
    let attempts = 0;
    const http = makeHttp({
      simpleUpload: vi.fn(async () => {
        attempts += 1;
        throw new StorageException(StorageError.upstream(503, "Service Unavailable"));
      }),
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await expect(
      adapter.upload({
        bytes: new Uint8Array(4),
        name: "f.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 4,
      }),
    ).rejects.toBeInstanceOf(StorageException);
    // Initial call + 3 retries = 4 attempts in total
    expect(attempts).toBe(4);
  });

  it("retries 429 (rate limited)", async () => {
    let attempts = 0;
    const http = makeHttp({
      simpleUpload: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new StorageException(StorageError.upstream(429, "Slow down"));
        return sampleMatch("file-1", 4);
      }),
    });
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await adapter.upload({
      bytes: new Uint8Array(4),
      name: "f.bin",
      mimeType: "application/octet-stream",
      sizeBytes: 4,
    });
    expect(attempts).toBe(2);
  });
});

describe("delete", () => {
  it("forwards the externalId to the wire", async () => {
    const http = makeHttp();
    const adapter = new GoogleDriveAdapter({
      http,
      token: async () => "ya29.token",
      backoff: ZERO_DELAY,
    });
    await adapter.delete("file-abc");
    expect(http.delete).toHaveBeenCalledWith("ya29.token", "file-abc");
  });
});
