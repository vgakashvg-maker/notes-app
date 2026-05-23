import {
  SIMPLE_UPLOAD_THRESHOLD_BYTES,
  StorageError,
  StorageException,
  type FileInput,
  type RemoteFile,
  type StorageProvider,
  type StorageProviderId,
} from "../../domain/src/index.ts";
import { DEFAULT_BACKOFF, retry, type BackoffConfig } from "./backoff.js";
import type { DriveHttpClient, DriveListMatch } from "./drive-http.js";

const APP_FOLDER_NAME = "NotesApp";
/** Drive's recommended chunk size; must be a multiple of 256 KB. */
const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;

/** Tokens supplied by the auth module on every call. */
export type TokenProvider = () => Promise<string | null>;

export interface GoogleDriveAdapterOptions {
  readonly http: DriveHttpClient;
  readonly token: TokenProvider;
  readonly backoff?: BackoffConfig;
}

/**
 * V1 storage adapter. Talks to Drive v3 via the [DriveHttpClient] port —
 * never imports the heavy `googleapis` package, keeping bundle size
 * reasonable.
 *
 * Folder caching: [ensureAppFolder] does a search on first call, creates
 * the folder if missing, and caches the id for the lifetime of the
 * adapter. Re-instantiate to force a re-lookup (e.g. on user switch).
 */
export class GoogleDriveAdapter implements StorageProvider {
  readonly id: StorageProviderId = "GOOGLE_DRIVE";
  private folderId: string | null = null;
  private folderPromise: Promise<string> | null = null;
  private readonly backoff: BackoffConfig;

  constructor(private readonly options: GoogleDriveAdapterOptions) {
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
  }

  async ensureAppFolder(): Promise<string> {
    if (this.folderId !== null) return this.folderId;
    if (this.folderPromise !== null) return this.folderPromise;
    this.folderPromise = this.lookupOrCreateFolder();
    try {
      this.folderId = await this.folderPromise;
      return this.folderId;
    } finally {
      this.folderPromise = null;
    }
  }

  async upload(file: FileInput, folderHint?: string): Promise<RemoteFile> {
    const folderId = await this.ensureAppFolder();
    if (file.sizeBytes < SIMPLE_UPLOAD_THRESHOLD_BYTES) {
      return this.simpleUpload(folderId, file, folderHint);
    }
    return this.resumableUpload(folderId, file, folderHint);
  }

  async getDownloadUrl(externalId: string, ttlSeconds = 300): Promise<string> {
    // Drive doesn't expose pre-signed URLs the way S3 does; the canonical
    // pattern is to embed a short-lived access token in the URL. The
    // storage/sign Edge Function is the source of truth — see storage-sign.ts.
    if (externalId.trim().length === 0) {
      throw new StorageException(StorageError.notFound("externalId is required"));
    }
    if (ttlSeconds <= 0 || ttlSeconds > 3600) {
      throw new StorageException(StorageError.transport("ttlSeconds must be in (0, 3600]"));
    }
    const token = await this.requireToken();
    // Sanity check the file exists; lets us surface NotFound before the
    // browser hits a 404.
    await this.callWithRetry(() => this.options.http.getMetadata(token, externalId));
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      externalId,
    )}?alt=media&access_token=${encodeURIComponent(token)}`;
  }

  async delete(externalId: string): Promise<void> {
    const token = await this.requireToken();
    await this.callWithRetry(() => this.options.http.delete(token, externalId));
  }

  private async simpleUpload(
    folderId: string,
    file: FileInput,
    folderHint: string | undefined,
  ): Promise<RemoteFile> {
    if (file.bytes === undefined) {
      throw new StorageException(StorageError.transport("simpleUpload requires file.bytes"));
    }
    const token = await this.requireToken();
    const result = await this.callWithRetry(() =>
      this.options.http.simpleUpload(
        token,
        folderId,
        file.name,
        file.mimeType,
        file.bytes!,
        folderHint,
      ),
    );
    return matchToRemoteFile(result);
  }

  private async resumableUpload(
    folderId: string,
    file: FileInput,
    folderHint: string | undefined,
  ): Promise<RemoteFile> {
    if (file.stream === undefined) {
      throw new StorageException(StorageError.transport("resumableUpload requires file.stream"));
    }
    const token = await this.requireToken();
    const session = await this.callWithRetry(() =>
      this.options.http.startResumableUpload(
        token,
        folderId,
        file.name,
        file.mimeType,
        file.sizeBytes,
        folderHint,
      ),
    );
    let offset = 0;
    let finalMeta: DriveListMatch | null = null;
    for await (const rawChunk of file.stream()) {
      if (rawChunk.byteLength === 0) continue;
      let pos = 0;
      while (pos < rawChunk.byteLength) {
        const end = Math.min(pos + RESUMABLE_CHUNK_BYTES, rawChunk.byteLength);
        const slice = rawChunk.subarray(pos, end);
        // Retry the chunk PUT specifically; the session URI is stable
        // across retries per Drive's resumable protocol.
        finalMeta = await this.callWithRetry(() =>
          this.options.http.putChunk(session.sessionUri, slice, offset, file.sizeBytes),
        );
        offset += slice.byteLength;
        pos = end;
      }
    }
    if (offset !== file.sizeBytes) {
      throw new StorageException(
        StorageError.transport(
          `Resumable upload truncated: sent ${offset} of ${file.sizeBytes} bytes`,
        ),
      );
    }
    if (finalMeta === null) {
      throw new StorageException(
        StorageError.upstream(500, "Resumable upload completed without final metadata"),
      );
    }
    return matchToRemoteFile(finalMeta);
  }

  private async lookupOrCreateFolder(): Promise<string> {
    const token = await this.requireToken();
    const existing = await this.callWithRetry(() =>
      this.options.http.findAppFolder(token, null, APP_FOLDER_NAME),
    );
    if (existing !== null) return existing;
    return this.callWithRetry(() => this.options.http.createFolder(token, null, APP_FOLDER_NAME));
  }

  private async requireToken(): Promise<string> {
    const token = await this.options.token();
    if (token === null || token.length === 0) {
      throw new StorageException(
        StorageError.unauthorized("No Google Drive token available; ask the user to re-link"),
      );
    }
    return token;
  }

  private callWithRetry<T>(op: () => Promise<T>): Promise<T> {
    return retry(op, isRetriable, this.backoff);
  }
}

function matchToRemoteFile(m: DriveListMatch): RemoteFile {
  return {
    externalId: m.id,
    name: m.name,
    mimeType: m.mimeType,
    sizeBytes: m.size,
  };
}

function isRetriable(err: unknown): boolean {
  if (!(err instanceof StorageException)) return false;
  const inner = err.error;
  if (inner.kind === "TransportError") return true;
  if (inner.kind === "UpstreamError") {
    return inner.status === 408 || inner.status === 429 || inner.status >= 500;
  }
  return false;
}
