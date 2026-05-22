import type { AttachmentRef } from "./attachment.js";
import type { FileInput } from "./storage.js";
import type { NoteId } from "./ids.js";

/**
 * The attachment pipeline port. Bridges the editor's
 * `insertAttachment(ref)` to the underlying storage provider (M03) and
 * the notes DB (M04) — neither of which knows about the other.
 *
 * Concrete implementations live in `@notes-app/attachments` (TS) and
 * `attachments-android` (Kotlin).
 */
export interface AttachmentPipeline {
  /**
   * Upload [file] and persist the matching `attachments_refs` row.
   *
   * The implementation MUST be atomic in the user-visible sense: if
   * the DB insert fails after the bytes land in Drive, the Drive file
   * is deleted before the error surfaces. Callers therefore never see
   * an `attachments_refs` row without a corresponding remote file or
   * a remote file without a row.
   */
  attach(noteId: NoteId, file: FileInput): Promise<AttachmentRef>;

  /** Short-lived signed URL for download. Never cache; never persist. */
  resolveUrl(ref: AttachmentRef): Promise<string>;

  /**
   * Remove both the DB row and the remote bytes. The order is DB-first
   * to keep RLS as the safety net; if the remote delete fails the row
   * is gone and the orphan is caught by the validator.
   */
  remove(ref: AttachmentRef): Promise<void>;

  /** Subscribe to per-attachment upload progress. */
  uploadProgress(ref: AttachmentRef): AsyncIterable<Progress>;
}

export type UploadState =
  | { kind: "Pending" }
  | { kind: "Uploading" }
  | { kind: "Done" }
  | { kind: "Failed"; message: string };

export const UploadState = {
  pending: (): UploadState => ({ kind: "Pending" }),
  uploading: (): UploadState => ({ kind: "Uploading" }),
  done: (): UploadState => ({ kind: "Done" }),
  failed: (message: string): UploadState => {
    if (message.trim().length === 0) {
      throw new Error("UploadState.Failed.message cannot be empty");
    }
    return { kind: "Failed", message };
  },
} as const;

export interface Progress {
  readonly bytesSent: number;
  readonly bytesTotal: number;
  readonly state: UploadState;
}

export function progress(bytesSent: number, bytesTotal: number, state: UploadState): Progress {
  if (!Number.isInteger(bytesSent) || bytesSent < 0) {
    throw new Error("Progress.bytesSent must be a non-negative integer");
  }
  if (!Number.isInteger(bytesTotal) || bytesTotal < 0) {
    throw new Error("Progress.bytesTotal must be a non-negative integer");
  }
  if (bytesSent > bytesTotal) {
    throw new Error("Progress.bytesSent must be <= bytesTotal");
  }
  return { bytesSent, bytesTotal, state };
}

/**
 * Shared thumbnail dimensions both clients commit to. The pipeline only
 * generates thumbnails for image MIME types — anything else uploads the
 * original verbatim.
 */
export const ThumbnailSpec = {
  maxLongestEdgePx: 800,
  jpegQuality: 80,
  // Image types we generate thumbnails for; anything else is uploaded as-is.
  thumbnailMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] as const,
} as const;

export type ThumbnailableMimeType = (typeof ThumbnailSpec.thumbnailMimeTypes)[number];

export function isThumbnailable(mimeType: string): boolean {
  return (ThumbnailSpec.thumbnailMimeTypes as readonly string[]).includes(mimeType);
}
