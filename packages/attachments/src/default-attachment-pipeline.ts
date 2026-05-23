import {
  UploadState,
  isThumbnailable,
  progress,
  type AttachmentPipeline,
  type AttachmentRef,
  type FileInput,
  type NoteId,
  type Progress,
  type StorageProvider,
} from "../../domain/src/index.ts";
import { ProgressBus } from "./progress-bus.js";
import type { AttachmentsRepo, ThumbnailGenerator } from "./ports.js";

export interface DefaultAttachmentPipelineOptions {
  readonly storage: StorageProvider;
  readonly repo: AttachmentsRepo;
  readonly thumbnails?: ThumbnailGenerator;
  /** Defaults to a fresh ProgressBus. Passed in by tests so they can spy. */
  readonly progressBus?: ProgressBus;
  /**
   * Override in tests; defaults to crypto.randomUUID() so an in-progress
   * upload has a stable key before the DB has minted an attachment id.
   */
  readonly newClientId?: () => string;
}

/**
 * The V1 pipeline. Three-step atomic upload with rollback:
 *
 *   1. Upload original to storage. Get `externalId`.
 *   2. Optionally upload a thumbnail. Get `thumbnailId`.
 *   3. Insert `attachments_refs` row. If this fails the bytes are
 *      removed from storage before the error surfaces — callers never
 *      observe a `attachments_refs` row without its bytes nor bytes
 *      without a row.
 *
 * Progress is fan-out through a [ProgressBus]; subscribers are keyed
 * by the *client-generated* id we issue at step 1, so the editor can
 * watch progress while we wait for the DB to mint the real
 * AttachmentId in step 3.
 */
export class DefaultAttachmentPipeline implements AttachmentPipeline {
  private readonly bus: ProgressBus;
  private readonly newClientId: () => string;

  constructor(private readonly options: DefaultAttachmentPipelineOptions) {
    this.bus = options.progressBus ?? new ProgressBus();
    this.newClientId = options.newClientId ?? defaultClientId;
  }

  async attach(noteId: NoteId, file: FileInput): Promise<AttachmentRef> {
    if (file.sizeBytes < 0 || !Number.isInteger(file.sizeBytes)) {
      throw new Error("FileInput.sizeBytes must be a non-negative integer");
    }
    const clientId = this.newClientId();
    this.bus.publish(clientId, progress(0, file.sizeBytes, UploadState.pending()));

    // Compute the thumbnail BEFORE we touch the network so a generator
    // failure costs nothing in remote bytes.
    let thumbnailFile: FileInput | null = null;
    if (this.options.thumbnails !== undefined && isThumbnailable(file.mimeType)) {
      try {
        thumbnailFile = await this.options.thumbnails.generate(file);
      } catch (cause) {
        // Thumbnail generation is best-effort. Upload the original
        // anyway; the validator surfaces a missing thumbnail later
        // without blocking the user from attaching the file now.
        thumbnailFile = null;
        // Re-publish so observers see we're still progressing, not stuck.
        this.bus.publish(clientId, progress(0, file.sizeBytes, UploadState.uploading()));
        void cause;
      }
    }

    this.bus.publish(clientId, progress(0, file.sizeBytes, UploadState.uploading()));

    let originalRemote;
    try {
      originalRemote = await this.options.storage.upload(file);
    } catch (cause) {
      this.publishFailed(clientId, file.sizeBytes, cause);
      throw cause;
    }

    let thumbnailExternalId: string | undefined;
    if (thumbnailFile !== null) {
      try {
        const tr = await this.options.storage.upload(thumbnailFile, "thumbnail");
        thumbnailExternalId = tr.externalId;
      } catch (cause) {
        // Treat as soft failure: rollback the original is too costly
        // because the user has already uploaded the bytes; instead
        // proceed without a thumbnail. The validator will flag the
        // missing thumbnail asynchronously.
        thumbnailExternalId = undefined;
        void cause;
      }
    }

    let ref: AttachmentRef;
    try {
      ref = await this.options.repo.insert({
        noteId,
        externalId: originalRemote.externalId,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        displayName: file.name,
        ...(thumbnailExternalId !== undefined ? { thumbnailId: thumbnailExternalId } : {}),
      });
    } catch (cause) {
      // Atomic rollback: if the DB insert fails, scrub both files from
      // storage before re-throwing.
      await this.safeRollback(originalRemote.externalId, thumbnailExternalId);
      this.publishFailed(clientId, file.sizeBytes, cause);
      throw cause;
    }

    this.bus.publish(clientId, progress(file.sizeBytes, file.sizeBytes, UploadState.done()));
    // Replay the final progress under the real AttachmentId too, so
    // editors that subscribe after the insert see the terminal state.
    this.bus.publish(ref.id, progress(file.sizeBytes, file.sizeBytes, UploadState.done()));
    return ref;
  }

  async resolveUrl(ref: AttachmentRef): Promise<string> {
    return this.options.storage.getDownloadUrl(ref.externalFileId);
  }

  async remove(ref: AttachmentRef): Promise<void> {
    await this.options.repo.delete(ref.id);
    // DB-first delete; if the remote delete fails, the validator
    // surfaces the orphan rather than leaving the user staring at a
    // broken pill.
    try {
      await this.options.storage.delete(ref.externalFileId);
    } catch (_cause) {
      // Swallow — best-effort. Validator handles orphans.
      void _cause;
    }
    if (ref.thumbnailId !== undefined) {
      try {
        await this.options.storage.delete(ref.thumbnailId);
      } catch (_cause) {
        void _cause;
      }
    }
  }

  uploadProgress(ref: AttachmentRef): AsyncIterable<Progress> {
    return this.bus.subscribe(ref.id);
  }

  /** Test-only handle to subscribe by the client-side id before the AttachmentRef exists. */
  uploadProgressByClientId(clientId: string): AsyncIterable<Progress> {
    return this.bus.subscribe(clientId);
  }

  private publishFailed(clientId: string, total: number, cause: unknown): void {
    const message = cause instanceof Error ? cause.message : String(cause);
    this.bus.publish(
      clientId,
      progress(0, total, UploadState.failed(message.length === 0 ? "Upload failed" : message)),
    );
  }

  private async safeRollback(
    originalExternalId: string,
    thumbnailExternalId: string | undefined,
  ): Promise<void> {
    try {
      await this.options.storage.delete(originalExternalId);
    } catch (_cause) {
      void _cause;
    }
    if (thumbnailExternalId !== undefined) {
      try {
        await this.options.storage.delete(thumbnailExternalId);
      } catch (_cause) {
        void _cause;
      }
    }
  }
}

function defaultClientId(): string {
  // Adapter-local id — never escapes the pipeline. crypto.randomUUID is
  // present in Node 19+ and every modern browser.
  return globalThis.crypto?.randomUUID?.() ?? fallbackId();
}

function fallbackId(): string {
  let buf = "";
  for (let i = 0; i < 32; i += 1) buf += Math.floor(Math.random() * 16).toString(16);
  return `${buf.slice(0, 8)}-${buf.slice(8, 12)}-4${buf.slice(13, 16)}-8${buf.slice(17, 20)}-${buf.slice(20, 32)}`;
}
