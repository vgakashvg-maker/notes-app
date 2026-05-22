package app.notes.attachments

import app.notes.domain.AttachmentId
import app.notes.domain.AttachmentRef
import app.notes.domain.FileInput
import app.notes.domain.NoteId
import app.notes.domain.Progress
import kotlinx.coroutines.flow.Flow

/**
 * The attachment pipeline port. Kotlin twin of the TS
 * `AttachmentPipeline`. Lives in this module (not in `core-domain`)
 * because `Flow` would pull `kotlinx-coroutines-core` into pure-types
 * domain — we keep that boundary clean.
 */
interface AttachmentPipeline {
    suspend fun attach(noteId: NoteId, file: FileInput): AttachmentRef
    suspend fun resolveUrl(ref: AttachmentRef): String
    suspend fun remove(ref: AttachmentRef)
    fun uploadProgress(ref: AttachmentRef): Flow<Progress>
}

interface AttachmentsRepo {
    suspend fun insert(input: NewAttachmentRefInput): AttachmentRef
    suspend fun delete(id: AttachmentId)
    suspend fun listForValidation(cursor: String?, limit: Int): ValidationPage
    suspend fun recordDangling(entry: DanglingEntry)
}

/**
 * Note: owner_id is intentionally NOT in [NewAttachmentRefInput]. The
 * repo binding stamps it from auth.uid() of the user's JWT server-side
 * (RLS), so the client can't get it wrong.
 */
data class NewAttachmentRefInput(
    val noteId: NoteId,
    val externalId: String,
    val mimeType: String,
    val sizeBytes: Long,
    val displayName: String,
    val thumbnailId: String? = null,
) {
    init {
        require(externalId.isNotBlank()) { "NewAttachmentRefInput.externalId cannot be empty" }
        require(displayName.isNotBlank()) { "NewAttachmentRefInput.displayName cannot be empty" }
        require(sizeBytes >= 0) { "NewAttachmentRefInput.sizeBytes must be >= 0" }
    }
}

data class ValidationPage(
    val rows: List<ValidationRow>,
    val nextCursor: String?,
)

data class ValidationRow(
    val id: String,
    val externalId: String,
    val thumbnailId: String?,
    val ownerId: String,
)

data class DanglingEntry(
    val attachmentId: String,
    val ownerId: String,
    val externalId: String,
    val missingOriginal: Boolean,
    val missingThumbnail: Boolean,
)

/** Platform port for thumbnail generation. Android wires Bitmap. */
fun interface ThumbnailGenerator {
    suspend fun generate(input: FileInput): FileInput
}
