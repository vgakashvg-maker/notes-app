package app.notes.domain

import java.io.InputStream

/**
 * The cross-cutting storage port. Concrete adapters live in
 * `storage-android`. Consumers depend on this interface only.
 */
interface StorageProvider {
    val id: StorageProviderId
    suspend fun upload(file: FileInput, folderHint: String? = null): RemoteFile
    suspend fun getDownloadUrl(externalId: String, ttlSeconds: Int = 300): String
    suspend fun delete(externalId: String)
    /** Create / find the per-app folder, returning its provider-side id. Cached. */
    suspend fun ensureAppFolder(): String
}

data class RemoteFile(
    val externalId: String,
    val name: String,
    val mimeType: String,
    val sizeBytes: Long,
) {
    init {
        require(externalId.isNotBlank()) { "RemoteFile.externalId cannot be empty" }
        require(name.isNotBlank()) { "RemoteFile.name cannot be empty" }
        require(sizeBytes >= 0) { "RemoteFile.sizeBytes must be >= 0" }
    }
}

/**
 * Either [bytes] (for small files) or [stream] (for resumable uploads) must
 * be present. Adapters pick based on [sizeBytes] vs
 * [SIMPLE_UPLOAD_THRESHOLD_BYTES].
 */
data class FileInput(
    val name: String,
    val mimeType: String,
    val sizeBytes: Long,
    val bytes: ByteArray? = null,
    val stream: (() -> InputStream)? = null,
) {
    init {
        require(name.isNotBlank()) { "FileInput.name cannot be empty" }
        require(mimeType.isNotBlank()) { "FileInput.mimeType cannot be empty" }
        require(sizeBytes >= 0) { "FileInput.sizeBytes must be >= 0" }
        require(bytes != null || stream != null) {
            "FileInput needs either bytes or stream"
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is FileInput) return false
        return name == other.name &&
            mimeType == other.mimeType &&
            sizeBytes == other.sizeBytes &&
            bytes contentEqualsOrBothNull other.bytes &&
            (stream == null) == (other.stream == null)
    }

    override fun hashCode(): Int {
        var result = name.hashCode()
        result = 31 * result + mimeType.hashCode()
        result = 31 * result + sizeBytes.hashCode()
        result = 31 * result + (bytes?.contentHashCode() ?: 0)
        return result
    }
}

private infix fun ByteArray?.contentEqualsOrBothNull(other: ByteArray?): Boolean =
    if (this == null && other == null) true
    else if (this == null || other == null) false
    else this.contentEquals(other)

const val SIMPLE_UPLOAD_THRESHOLD_BYTES: Long = 5L * 1024L * 1024L

sealed class StorageError(val message: String) {
    class Unauthorized(message: String) : StorageError(message)
    class QuotaExceeded(message: String) : StorageError(message)
    class NotFound(message: String) : StorageError(message)
    class TransportError(message: String) : StorageError(message)
    class UpstreamError(val status: Int, message: String) : StorageError(message)
}

class StorageException(val error: StorageError) :
    RuntimeException("[${error::class.simpleName}] ${error.message}")
