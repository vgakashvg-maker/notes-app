package app.notes.domain

/**
 * Value types shared between the editor (M06) and the attachment
 * pipeline (M07). The Pipeline interface itself lives in the
 * `attachments-android` module because it needs `kotlinx.coroutines.Flow`,
 * which we keep out of pure-types core-domain.
 */

sealed class UploadState {
    object Pending : UploadState()
    object Uploading : UploadState()
    object Done : UploadState()
    data class Failed(val message: String) : UploadState() {
        init { require(message.isNotBlank()) { "UploadState.Failed.message cannot be empty" } }
    }
}

data class Progress(val bytesSent: Long, val bytesTotal: Long, val state: UploadState) {
    init {
        require(bytesSent >= 0) { "Progress.bytesSent must be >= 0" }
        require(bytesTotal >= 0) { "Progress.bytesTotal must be >= 0" }
        require(bytesSent <= bytesTotal) { "Progress.bytesSent must be <= bytesTotal" }
    }
}

/** Shared thumbnail dimensions both clients commit to. */
object ThumbnailSpec {
    const val MAX_LONGEST_EDGE_PX: Int = 800
    const val JPEG_QUALITY: Int = 80
    val THUMBNAIL_MIME_TYPES: Set<String> = setOf(
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    )

    fun isThumbnailable(mimeType: String): Boolean = mimeType in THUMBNAIL_MIME_TYPES
}
