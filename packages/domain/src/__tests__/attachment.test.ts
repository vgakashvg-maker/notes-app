import { describe, expect, it } from "vitest";
import { makeAttachmentRef, type AttachmentRef } from "../attachment.js";
import { AttachmentId, NoteId, UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const NOTE = NoteId("550e8400-e29b-41d4-a716-446655440001");
const ATT = AttachmentId("550e8400-e29b-41d4-a716-446655440010");

function base(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    id: ATT,
    ownerId: OWNER,
    noteId: NOTE,
    provider: "GOOGLE_DRIVE",
    externalFileId: "drive-file-abc",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    displayName: "spec.pdf",
    ...overrides,
  };
}

describe("makeAttachmentRef", () => {
  it("accepts a valid attachment", () => {
    expect(makeAttachmentRef(base()).provider).toBe("GOOGLE_DRIVE");
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      makeAttachmentRef(base({ provider: "DROPBOX" as unknown as AttachmentRef["provider"] })),
    ).toThrow(/provider/);
  });

  it("rejects a missing externalFileId", () => {
    expect(() => makeAttachmentRef(base({ externalFileId: "" }))).toThrow(/externalFileId/);
  });

  it("rejects a malformed mimeType", () => {
    expect(() => makeAttachmentRef(base({ mimeType: "pdf" }))).toThrow(/mimeType/);
  });

  it("rejects a negative size", () => {
    expect(() => makeAttachmentRef(base({ sizeBytes: -1 }))).toThrow(/sizeBytes/);
  });
});
