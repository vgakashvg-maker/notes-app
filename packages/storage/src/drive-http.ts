/**
 * Wire-level port the GoogleDriveAdapter talks to. The Drive REST API
 * has a handful of distinct surfaces (search, simple upload, resumable
 * upload start, resumable upload chunk, delete, get) — modelling them
 * here lets the test harness mock each one without an HTTP layer. The
 * production binding (M06 web shell, M12 Android shell) wires a real
 * `fetch` to each method.
 *
 * Bearer-token plumbing is the adapter's responsibility: it asks the
 * caller (AuthProvider.providerAccessToken("GOOGLE_DRIVE")) for a fresh
 * token on every call. The port stays auth-agnostic.
 */

export interface DriveListMatch {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface ResumableUploadHandle {
  /**
   * URL returned by Drive's "start resumable upload" endpoint. The
   * adapter PUTs to this URL with `Content-Range` headers.
   */
  readonly sessionUri: string;
}

export interface DriveHttpClient {
  /**
   * Find a folder by name under [parentId] (or root, when null) owned by
   * the app. Returns the first match's id or null. Used by
   * `ensureAppFolder()`.
   */
  findAppFolder(token: string, parentId: string | null, name: string): Promise<string | null>;

  /** Create a folder; returns the new folder's id. */
  createFolder(token: string, parentId: string | null, name: string): Promise<string>;

  /** Simple (multipart) upload for files under the resumable threshold. */
  simpleUpload(
    token: string,
    folderId: string,
    name: string,
    mimeType: string,
    bytes: Uint8Array,
    folderHint: string | undefined,
  ): Promise<DriveListMatch>;

  /** Start a resumable upload session; returns the session URI. */
  startResumableUpload(
    token: string,
    folderId: string,
    name: string,
    mimeType: string,
    sizeBytes: number,
    folderHint: string | undefined,
  ): Promise<ResumableUploadHandle>;

  /**
   * PUT a chunk to the session URI. Returns the new file metadata when
   * the upload completes; returns null when the session is awaiting
   * more chunks.
   */
  putChunk(
    sessionUri: string,
    chunk: Uint8Array,
    rangeStart: number,
    totalSize: number,
  ): Promise<DriveListMatch | null>;

  /** Drive `files.get` returning size + name (used by the sign helper). */
  getMetadata(token: string, externalId: string): Promise<DriveListMatch>;

  delete(token: string, externalId: string): Promise<void>;
}
