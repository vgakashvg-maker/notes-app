package app.notes.storage

import app.notes.domain.FileInput
import app.notes.domain.RemoteFile
import app.notes.domain.SIMPLE_UPLOAD_THRESHOLD_BYTES
import app.notes.domain.StorageError
import app.notes.domain.StorageException
import app.notes.domain.StorageProvider
import app.notes.domain.StorageProviderId
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val APP_FOLDER_NAME = "NotesApp"

/**
 * V1 storage adapter. Wraps the Drive v3 REST surface via the [DriveHttp]
 * port. Auth-agnostic: the constructor takes a [TokenProvider] that asks
 * the auth module for a fresh token on every call.
 */
class GoogleDriveAdapter(
    private val http: DriveHttp,
    private val tokenProvider: TokenProvider,
    private val backoff: BackoffConfig = BackoffConfig(),
) : StorageProvider {
    override val id: StorageProviderId = StorageProviderId.GoogleDrive

    @Volatile private var folderId: String? = null
    private val folderMutex = Mutex()

    override suspend fun ensureAppFolder(): String {
        folderId?.let { return it }
        folderMutex.withLock {
            folderId?.let { return it }
            val resolved = lookupOrCreateFolder()
            folderId = resolved
            return resolved
        }
    }

    override suspend fun upload(file: FileInput, folderHint: String?): RemoteFile {
        val folder = ensureAppFolder()
        return if (file.sizeBytes < SIMPLE_UPLOAD_THRESHOLD_BYTES) {
            simpleUpload(folder, file, folderHint)
        } else {
            resumableUpload(folder, file, folderHint)
        }
    }

    override suspend fun getDownloadUrl(externalId: String, ttlSeconds: Int): String {
        if (externalId.isBlank()) {
            throw StorageException(StorageError.NotFound("externalId is required"))
        }
        if (ttlSeconds !in 1..3600) {
            throw StorageException(StorageError.TransportError("ttlSeconds must be in (0, 3600]"))
        }
        val token = requireToken()
        callWithRetry { http.getMetadata(token, externalId) }
        return "https://www.googleapis.com/drive/v3/files/" +
            externalId.encodeUrl() +
            "?alt=media&access_token=" +
            token.encodeUrl()
    }

    override suspend fun delete(externalId: String) {
        val token = requireToken()
        callWithRetry { http.delete(token, externalId) }
    }

    private suspend fun simpleUpload(
        folder: String,
        file: FileInput,
        folderHint: String?,
    ): RemoteFile {
        val bytes = file.bytes
            ?: throw StorageException(StorageError.TransportError("simpleUpload requires FileInput.bytes"))
        val token = requireToken()
        val meta = callWithRetry {
            http.simpleUpload(token, folder, file.name, file.mimeType, bytes, folderHint)
        }
        return meta.toRemoteFile()
    }

    private suspend fun resumableUpload(
        folder: String,
        file: FileInput,
        folderHint: String?,
    ): RemoteFile {
        val streamFactory = file.stream
            ?: throw StorageException(StorageError.TransportError("resumableUpload requires FileInput.stream"))
        val token = requireToken()
        val session = callWithRetry {
            http.startResumableUpload(
                token,
                folder,
                file.name,
                file.mimeType,
                file.sizeBytes,
                folderHint,
            )
        }
        val chunks = InputStreamChunkSource(streamFactory())
        var offset = 0L
        var finalMeta: DriveFileMeta? = null
        while (true) {
            val chunk = chunks.nextChunk() ?: break
            if (chunk.isEmpty()) continue
            finalMeta = callWithRetry {
                http.putChunk(session.sessionUri, chunk, offset, file.sizeBytes)
            }
            offset += chunk.size
        }
        if (offset != file.sizeBytes) {
            throw StorageException(
                StorageError.TransportError(
                    "Resumable upload truncated: sent $offset of ${file.sizeBytes} bytes",
                ),
            )
        }
        val resolved = finalMeta
            ?: throw StorageException(
                StorageError.UpstreamError(500, "Resumable upload completed without final metadata"),
            )
        return resolved.toRemoteFile()
    }

    private suspend fun lookupOrCreateFolder(): String {
        val token = requireToken()
        val existing = callWithRetry { http.findAppFolder(token, null, APP_FOLDER_NAME) }
        if (existing != null) return existing
        return callWithRetry { http.createFolder(token, null, APP_FOLDER_NAME) }
    }

    private suspend fun requireToken(): String {
        val t = tokenProvider()
        if (t.isNullOrEmpty()) {
            throw StorageException(
                StorageError.Unauthorized("No Google Drive token available; ask the user to re-link"),
            )
        }
        return t
    }

    private suspend fun <T> callWithRetry(op: suspend () -> T): T =
        retry(op, ::isRetriable, backoff)
}

private fun DriveFileMeta.toRemoteFile(): RemoteFile = RemoteFile(
    externalId = id,
    name = name,
    mimeType = mimeType,
    sizeBytes = size,
)

internal fun isRetriable(err: Throwable): Boolean {
    if (err !is StorageException) return false
    return when (val inner = err.error) {
        is StorageError.TransportError -> true
        is StorageError.UpstreamError -> inner.status == 408 || inner.status == 429 || inner.status >= 500
        else -> false
    }
}

private fun String.encodeUrl(): String =
    java.net.URLEncoder.encode(this, java.nio.charset.StandardCharsets.UTF_8)
