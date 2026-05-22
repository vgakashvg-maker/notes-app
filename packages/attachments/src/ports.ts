import type { AttachmentId, AttachmentRef, FileInput, NoteId } from "@notes-app/domain";

/**
 * Insert / delete on `attachments_refs`. The production binding wraps
 * PostgREST under the user's JWT (RLS confines the row set); tests
 * pass an in-memory fake.
 */
export interface AttachmentsRepo {
  /**
   * Persist the row that the pipeline just minted. The implementation
   * is responsible for stamping `owner_id` from the user JWT (via RLS)
   * and returning the canonical row.
   */
  insert(input: NewAttachmentRefInput): Promise<AttachmentRef>;

  /** Delete by id. Idempotent — missing rows count as success. */
  delete(id: AttachmentId): Promise<void>;

  /**
   * Paged scan over all rows for the validator. The Edge Function calls
   * this with the service-role key; client code never does.
   */
  listForValidation(cursor: string | null, limit: number): Promise<ValidationPage>;

  /** Record a dangling-ref entry. Used by the validator. */
  recordDangling(entry: DanglingEntry): Promise<void>;
}

export interface NewAttachmentRefInput {
  readonly noteId: NoteId;
  readonly externalId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly displayName: string;
  readonly thumbnailId?: string;
}

/**
 * Note: owner_id is intentionally NOT in [NewAttachmentRefInput]. The
 * repo binding stamps it from the auth.uid() of the user's JWT
 * server-side (via RLS), so the client can't get it wrong. See the
 * stamping trigger pattern used by note_tags in M04.
 */

export interface ValidationPage {
  /** Plain-shape rows so the validator stays JSON-driven. */
  readonly rows: readonly ValidationRow[];
  /** Opaque cursor for the next page; null when caller has reached the end. */
  readonly nextCursor: string | null;
}

export interface ValidationRow {
  readonly id: string;
  readonly external_id: string;
  readonly thumbnail_id: string | null;
  readonly owner_id: string;
}

export interface DanglingEntry {
  readonly attachmentId: string;
  readonly ownerId: string;
  readonly externalId: string;
  readonly missingThumbnail: boolean;
  readonly missingOriginal: boolean;
}

/**
 * Platform port for thumbnail generation. Web wires HTMLCanvasElement /
 * OffscreenCanvas; Android wires android.graphics.Bitmap. Tests pass a
 * function that returns canned bytes.
 */
export interface ThumbnailGenerator {
  /**
   * Generate a thumbnail of [input]. The implementation MUST honour
   * `ThumbnailSpec.maxLongestEdgePx` and emit JPEG at quality 80; the
   * pipeline trusts the produced bytes verbatim.
   */
  generate(input: FileInput): Promise<FileInput>;
}
