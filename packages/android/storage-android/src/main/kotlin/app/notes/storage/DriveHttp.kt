package app.notes.storage

import java.io.InputStream

/**
 * Wire-level port the GoogleDriveAdapter talks to. Mirrors the TS twin's
 * `DriveHttpClient`. The Android shell (M12) wires a Ktor implementation;
 * tests use a scripted fake.
 */
interface DriveHttp {
    suspend fun findAppFolder(token: String, parentId: String?, name: String): String?
    suspend fun createFolder(token: String, parentId: String?, name: String): String
    suspend fun simpleUpload(
        token: String,
        folderId: String,
        name: String,
        mimeType: String,
        bytes: ByteArray,
        folderHint: String?,
    ): DriveFileMeta
    suspend fun startResumableUpload(
        token: String,
        folderId: String,
        name: String,
        mimeType: String,
        sizeBytes: Long,
        folderHint: String?,
    ): ResumableUploadHandle
    /**
     * PUT a chunk to the session URI. Returns the new file metadata when
     * the upload completes; returns null when the session is awaiting
     * more chunks.
     */
    suspend fun putChunk(
        sessionUri: String,
        chunk: ByteArray,
        rangeStart: Long,
        totalSize: Long,
    ): DriveFileMeta?
    suspend fun getMetadata(token: String, externalId: String): DriveFileMeta
    suspend fun delete(token: String, externalId: String)
}

data class DriveFileMeta(
    val id: String,
    val name: String,
    val mimeType: String,
    val size: Long,
)

data class ResumableUploadHandle(val sessionUri: String) {
    init { require(sessionUri.isNotBlank()) { "ResumableUploadHandle.sessionUri cannot be empty" } }
}

/** Token-supplier alias the adapter accepts. The Android shell wires this
 * to `AuthProvider.providerAccessToken(GoogleDrive)`. */
typealias TokenProvider = suspend () -> String?

/** Async chunk source the adapter pulls from during a resumable upload. */
fun interface ChunkSource {
    suspend fun nextChunk(): ByteArray?
}

/** Adapter from a blocking InputStream → ChunkSource for callers
 * that already have a stream-shaped FileInput. */
class InputStreamChunkSource(
    private val stream: InputStream,
    private val chunkBytes: Int = DEFAULT_CHUNK_BYTES,
) : ChunkSource {
    override suspend fun nextChunk(): ByteArray? {
        val buffer = ByteArray(chunkBytes)
        val read = stream.read(buffer)
        return when {
            read < 0 -> null
            read == buffer.size -> buffer
            else -> buffer.copyOf(read)
        }
    }

    companion object {
        const val DEFAULT_CHUNK_BYTES: Int = 8 * 1024 * 1024
    }
}
