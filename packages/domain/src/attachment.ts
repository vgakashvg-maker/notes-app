import type { AttachmentId, NoteId, UserId } from "./ids.ts";
import type { StorageProviderId } from "./enums.ts";
import { StorageProviderIds } from "./enums.ts";

export interface AttachmentRef {
  readonly id: AttachmentId;
  readonly ownerId: UserId;
  readonly noteId: NoteId;
  readonly provider: StorageProviderId;
  readonly externalFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly displayName: string;
  readonly thumbnailId?: string;
}

const MIME_RE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;

export function makeAttachmentRef(input: AttachmentRef): AttachmentRef {
  if (!StorageProviderIds.includes(input.provider)) {
    throw new Error(`AttachmentRef.provider must be one of ${StorageProviderIds.join(", ")}`);
  }
  if (input.externalFileId.trim().length === 0) {
    throw new Error("AttachmentRef.externalFileId cannot be empty");
  }
  if (!MIME_RE.test(input.mimeType)) {
    throw new Error(
      `AttachmentRef.mimeType must be a type/subtype string, got ${JSON.stringify(input.mimeType)}`,
    );
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new Error("AttachmentRef.sizeBytes must be a non-negative integer");
  }
  if (input.displayName.trim().length === 0) {
    throw new Error("AttachmentRef.displayName cannot be empty");
  }
  return input;
}
