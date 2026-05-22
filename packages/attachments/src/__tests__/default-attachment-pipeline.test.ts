import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentId,
  NoteId,
  UserId,
  makeAttachmentRef,
  type AttachmentRef,
  type FileInput,
  type RemoteFile,
  type StorageProvider,
  type Progress,
} from "@notes-app/domain";
import { DefaultAttachmentPipeline } from "../default-attachment-pipeline.js";
import type { AttachmentsRepo, ThumbnailGenerator } from "../ports.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const NOTE = NoteId("550e8400-e29b-41d4-a716-446655440001");
const ATT = AttachmentId("550e8400-e29b-41d4-a716-446655440010");
const CLIENT_ID = "01234567-89ab-4cde-8f01-23456789abcd";

function sampleRef(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return makeAttachmentRef({
    id: ATT,
    ownerId: OWNER,
    noteId: NOTE,
    provider: "GOOGLE_DRIVE",
    externalFileId: "drive-original",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    displayName: "spec.pdf",
    ...overrides,
  });
}

function makeStorage(overrides: Partial<StorageProvider> = {}): StorageProvider {
  return {
    id: "GOOGLE_DRIVE",
    upload: vi.fn(async (file: FileInput) => makeRemote("drive-original", file)),
    delete: vi.fn(async () => {}),
    getDownloadUrl: vi.fn(async (id) => `https://drive/${id}`),
    ensureAppFolder: vi.fn(async () => "folder-1"),
    ...overrides,
  };
}

function makeRemote(externalId: string, file: FileInput): RemoteFile {
  return {
    externalId,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

function makeRepo(overrides: Partial<AttachmentsRepo> = {}): AttachmentsRepo {
  return {
    insert: vi.fn(async (input) =>
      sampleRef({
        externalFileId: input.externalId,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        displayName: input.displayName,
        ...(input.thumbnailId !== undefined ? { thumbnailId: input.thumbnailId } : {}),
      }),
    ),
    delete: vi.fn(async () => {}),
    listForValidation: vi.fn(async () => ({ rows: [], nextCursor: null })),
    recordDangling: vi.fn(async () => {}),
    ...overrides,
  };
}

const pdfFile: FileInput = {
  bytes: new Uint8Array(1024),
  name: "spec.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

const pngFile: FileInput = {
  bytes: new Uint8Array(2048),
  name: "photo.png",
  mimeType: "image/png",
  sizeBytes: 2048,
};

const thumbnailFile: FileInput = {
  bytes: new Uint8Array(256),
  name: "photo.thumb.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 256,
};

describe("DefaultAttachmentPipeline.attach", () => {
  let storage: StorageProvider;
  let repo: AttachmentsRepo;
  let pipeline: DefaultAttachmentPipeline;

  beforeEach(() => {
    storage = makeStorage();
    repo = makeRepo();
    pipeline = new DefaultAttachmentPipeline({
      storage,
      repo,
      newClientId: () => CLIENT_ID,
    });
  });

  it("uploads bytes, inserts the row, returns the AttachmentRef", async () => {
    const ref = await pipeline.attach(NOTE, pdfFile);
    expect(ref.externalFileId).toBe("drive-original");
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it("generates a thumbnail for image MIME types and uploads both", async () => {
    let uploadCount = 0;
    const storageWithCounter = makeStorage({
      upload: vi.fn(async (file: FileInput, hint?: string) => {
        uploadCount += 1;
        const externalId = hint === "thumbnail" ? "drive-thumb" : "drive-original";
        return makeRemote(externalId, file);
      }),
    });
    const thumbnails: ThumbnailGenerator = {
      generate: vi.fn(async () => thumbnailFile),
    };
    const p = new DefaultAttachmentPipeline({
      storage: storageWithCounter,
      repo,
      thumbnails,
      newClientId: () => CLIENT_ID,
    });
    const ref = await p.attach(NOTE, pngFile);
    expect(uploadCount).toBe(2);
    expect(thumbnails.generate).toHaveBeenCalledTimes(1);
    expect(ref.thumbnailId).toBe("drive-thumb");
  });

  it("does NOT generate a thumbnail for non-image MIME types", async () => {
    const thumbnails: ThumbnailGenerator = {
      generate: vi.fn(async () => thumbnailFile),
    };
    const p = new DefaultAttachmentPipeline({
      storage,
      repo,
      thumbnails,
      newClientId: () => CLIENT_ID,
    });
    await p.attach(NOTE, pdfFile);
    expect(thumbnails.generate).not.toHaveBeenCalled();
  });

  it("rolls back the uploaded bytes when the DB insert fails", async () => {
    const failingRepo = makeRepo({
      insert: vi.fn(async () => {
        throw new Error("RLS denied");
      }),
    });
    const p = new DefaultAttachmentPipeline({
      storage,
      repo: failingRepo,
      newClientId: () => CLIENT_ID,
    });
    await expect(p.attach(NOTE, pdfFile)).rejects.toThrow(/RLS denied/);
    expect(storage.delete).toHaveBeenCalledWith("drive-original");
  });

  it("rolls back both files when DB insert fails after the thumbnail upload", async () => {
    const storageWithThumb = makeStorage({
      upload: vi.fn(async (file: FileInput, hint?: string) => {
        const externalId = hint === "thumbnail" ? "drive-thumb" : "drive-original";
        return makeRemote(externalId, file);
      }),
      delete: vi.fn(async () => {}),
    });
    const thumbnails: ThumbnailGenerator = {
      generate: vi.fn(async () => thumbnailFile),
    };
    const failingRepo = makeRepo({
      insert: vi.fn(async () => {
        throw new Error("RLS denied");
      }),
    });
    const p = new DefaultAttachmentPipeline({
      storage: storageWithThumb,
      repo: failingRepo,
      thumbnails,
      newClientId: () => CLIENT_ID,
    });
    await expect(p.attach(NOTE, pngFile)).rejects.toThrow();
    expect(storageWithThumb.delete).toHaveBeenCalledWith("drive-original");
    expect(storageWithThumb.delete).toHaveBeenCalledWith("drive-thumb");
  });

  it("uploads original even if the thumbnail upload fails (soft-failure)", async () => {
    let uploads = 0;
    const flakyStorage = makeStorage({
      upload: vi.fn(async (file: FileInput, hint?: string) => {
        uploads += 1;
        if (hint === "thumbnail") {
          throw new Error("Drive 503 during thumbnail");
        }
        return makeRemote("drive-original", file);
      }),
    });
    const thumbnails: ThumbnailGenerator = {
      generate: vi.fn(async () => thumbnailFile),
    };
    const p = new DefaultAttachmentPipeline({
      storage: flakyStorage,
      repo,
      thumbnails,
      newClientId: () => CLIENT_ID,
    });
    const ref = await p.attach(NOTE, pngFile);
    expect(uploads).toBe(2);
    // No thumbnailId on the inserted row when the thumb upload failed.
    expect(ref.thumbnailId).toBeUndefined();
  });

  it("uploads original even if the thumbnail GENERATOR fails (soft-failure)", async () => {
    const flakyThumbnails: ThumbnailGenerator = {
      generate: vi.fn(async () => {
        throw new Error("Canvas exploded");
      }),
    };
    const p = new DefaultAttachmentPipeline({
      storage,
      repo,
      thumbnails: flakyThumbnails,
      newClientId: () => CLIENT_ID,
    });
    const ref = await p.attach(NOTE, pngFile);
    expect(ref.thumbnailId).toBeUndefined();
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("publishes Failed when the original upload fails and does not call repo.insert", async () => {
    const failingStorage = makeStorage({
      upload: vi.fn(async () => {
        throw new Error("Drive 503");
      }),
    });
    const p = new DefaultAttachmentPipeline({
      storage: failingStorage,
      repo,
      newClientId: () => CLIENT_ID,
    });
    await expect(p.attach(NOTE, pdfFile)).rejects.toThrow(/Drive 503/);
    expect(repo.insert).not.toHaveBeenCalled();
    const snap = p["bus"].current(CLIENT_ID);
    expect(snap?.state.kind).toBe("Failed");
  });
});

describe("DefaultAttachmentPipeline.uploadProgress", () => {
  it("emits Pending -> Uploading -> Done across a successful upload", async () => {
    const storage = makeStorage();
    const repo = makeRepo();
    const pipeline = new DefaultAttachmentPipeline({
      storage,
      repo,
      newClientId: () => CLIENT_ID,
    });
    const seen: Progress[] = [];
    const iter = pipeline.uploadProgressByClientId(CLIENT_ID)[Symbol.asyncIterator]();
    const pump = (async () => {
      for (let i = 0; i < 3; i += 1) {
        const n = await iter.next();
        if (n.done) break;
        seen.push(n.value);
      }
    })();
    await pipeline.attach(NOTE, pdfFile);
    await pump;
    await iter.return?.();
    expect(seen.map((p) => p.state.kind)).toEqual(["Pending", "Uploading", "Done"]);
  });

  it("emits Failed on upload failure", async () => {
    const failingStorage = makeStorage({
      upload: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const pipeline = new DefaultAttachmentPipeline({
      storage: failingStorage,
      repo: makeRepo(),
      newClientId: () => CLIENT_ID,
    });
    const seen: Progress[] = [];
    const iter = pipeline.uploadProgressByClientId(CLIENT_ID)[Symbol.asyncIterator]();
    const pump = (async () => {
      for (let i = 0; i < 3; i += 1) {
        const n = await iter.next();
        if (n.done) break;
        seen.push(n.value);
      }
    })();
    await expect(pipeline.attach(NOTE, pdfFile)).rejects.toThrow();
    await pump;
    await iter.return?.();
    expect(seen.at(-1)?.state.kind).toBe("Failed");
  });
});

describe("DefaultAttachmentPipeline.resolveUrl + remove", () => {
  it("resolveUrl proxies to StorageProvider.getDownloadUrl with the externalFileId", async () => {
    const storage = makeStorage();
    const pipeline = new DefaultAttachmentPipeline({ storage, repo: makeRepo() });
    const url = await pipeline.resolveUrl(sampleRef());
    expect(url).toBe("https://drive/drive-original");
    expect(storage.getDownloadUrl).toHaveBeenCalledWith("drive-original");
  });

  it("remove deletes the DB row first, then the remote bytes", async () => {
    const order: string[] = [];
    const storage = makeStorage({
      delete: vi.fn(async (id) => {
        order.push(`storage:${id}`);
      }),
    });
    const repo = makeRepo({
      delete: vi.fn(async (id) => {
        order.push(`db:${id}`);
      }),
    });
    const pipeline = new DefaultAttachmentPipeline({ storage, repo });
    await pipeline.remove(sampleRef({ thumbnailId: "drive-thumb" }));
    expect(order).toEqual([`db:${ATT}`, "storage:drive-original", "storage:drive-thumb"]);
  });

  it("remove swallows storage delete failures so the row stays gone", async () => {
    const storage = makeStorage({
      delete: vi.fn(async () => {
        throw new Error("Drive 503");
      }),
    });
    const repo = makeRepo();
    const pipeline = new DefaultAttachmentPipeline({ storage, repo });
    await expect(pipeline.remove(sampleRef())).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalled();
  });
});
