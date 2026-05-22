import type { StorageProviderId } from "./enums.js";

/**
 * The cross-cutting storage port. Concrete adapters
 * (GoogleDriveAdapter in V1) live in `@notes-app/storage`. Consumers
 * (M07 Attachment Pipeline, M06 editor's `insertAttachment`) depend on
 * this interface only — they never know whether the bytes land in
 * Drive, OneDrive, or S3.
 */
export interface StorageProvider {
  readonly id: StorageProviderId;
  /**
   * Upload [file] to the provider, returning the persistent reference
   * the rest of the app stores in `attachments_refs.external_id`.
   * `folderHint` is advisory — adapters may use it (e.g. as a Drive
   * appProperties tag) or ignore it.
   */
  upload(file: FileInput, folderHint?: string): Promise<RemoteFile>;
  /** Short-lived (≤ ttlSeconds, default 300) URL the client can fetch from. */
  getDownloadUrl(externalId: string, ttlSeconds?: number): Promise<string>;
  delete(externalId: string): Promise<void>;
  /** Create / find the per-app folder, returning its provider-side id. Cached. */
  ensureAppFolder(): Promise<string>;
}

export interface RemoteFile {
  readonly externalId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/**
 * Input contract for an upload. Adapters pick between [bytes] and [stream]
 * based on size: anything under [SIMPLE_UPLOAD_THRESHOLD_BYTES] goes via
 * the small-file path; larger files use resumable upload and pull from
 * [stream] lazily so we don't materialise the whole file in memory.
 */
export interface FileInput {
  readonly bytes?: Uint8Array;
  readonly stream?: () => AsyncIterable<Uint8Array>;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export const SIMPLE_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB

/** Provider-agnostic storage failure modes. */
export type StorageError =
  | { kind: "Unauthorized"; message: string }
  | { kind: "QuotaExceeded"; message: string }
  | { kind: "NotFound"; message: string }
  | { kind: "TransportError"; message: string }
  | { kind: "UpstreamError"; status: number; message: string };

export const StorageError = {
  unauthorized: (message: string): StorageError => ({ kind: "Unauthorized", message }),
  quotaExceeded: (message: string): StorageError => ({ kind: "QuotaExceeded", message }),
  notFound: (message: string): StorageError => ({ kind: "NotFound", message }),
  transport: (message: string): StorageError => ({ kind: "TransportError", message }),
  upstream: (status: number, message: string): StorageError => ({
    kind: "UpstreamError",
    status,
    message,
  }),
} as const;

export class StorageException extends Error {
  readonly code = "ERR_STORAGE" as const;
  constructor(public readonly error: StorageError) {
    super(`[${error.kind}] ${error.message}`);
  }
}
