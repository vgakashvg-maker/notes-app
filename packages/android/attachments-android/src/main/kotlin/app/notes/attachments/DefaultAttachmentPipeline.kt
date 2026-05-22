package app.notes.attachments

import app.notes.domain.AttachmentRef
import app.notes.domain.FileInput
import app.notes.domain.NoteId
import app.notes.domain.Progress
import app.notes.domain.StorageProvider
import app.notes.domain.ThumbnailSpec
import app.notes.domain.UploadState
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * V1 pipeline. Three-step atomic upload + rollback. Pure JVM Kotlin.
 * The Android shell (M12) supplies the concrete `StorageProvider`,
 * `AttachmentsRepo`, and `ThumbnailGenerator` bindings.
 */
class DefaultAttachmentPipeline(
    private val storage: StorageProvider,
    private val repo: AttachmentsRepo,
    private val thumbnails: ThumbnailGenerator? = null,
    private val bus: ProgressBus = ProgressBus(),
    private val newClientId: () -> String = { UUID.randomUUID().toString() },
) : AttachmentPipeline {

    override suspend fun attach(noteId: NoteId, file: FileInput): AttachmentRef {
        val clientId = newClientId()
        bus.publish(clientId, Progress(0, file.sizeBytes, UploadState.Pending))

        val thumbnailFile = generateThumbnailOrNull(file, clientId)
        bus.publish(clientId, Progress(0, file.sizeBytes, UploadState.Uploading))

        val original = try {
            storage.upload(file)
        } catch (cause: Throwable) {
            publishFailed(clientId, file.sizeBytes, cause)
            throw cause
        }

        val thumbnailExternalId = if (thumbnailFile != null) uploadThumbnailOrNull(thumbnailFile) else null

        val ref = try {
            repo.insert(
                NewAttachmentRefInput(
                    noteId = noteId,
                    externalId = original.externalId,
                    mimeType = file.mimeType,
                    sizeBytes = file.sizeBytes,
                    displayName = file.name,
                    thumbnailId = thumbnailExternalId,
                ),
            )
        } catch (cause: Throwable) {
            safeRollback(original.externalId, thumbnailExternalId)
            publishFailed(clientId, file.sizeBytes, cause)
            throw cause
        }

        val done = Progress(file.sizeBytes, file.sizeBytes, UploadState.Done)
        bus.publish(clientId, done)
        bus.publish(ref.id.raw, done)
        return ref
    }

    override suspend fun resolveUrl(ref: AttachmentRef): String =
        storage.getDownloadUrl(ref.externalFileId)

    override suspend fun remove(ref: AttachmentRef) {
        repo.delete(ref.id)
        // DB-first delete; if the remote delete fails the validator
        // catches the orphan rather than the user seeing a broken pill.
        runCatching { storage.delete(ref.externalFileId) }
        ref.thumbnailId?.let { runCatching { storage.delete(it) } }
    }

    override fun uploadProgress(ref: AttachmentRef): Flow<Progress> = bus.subscribe(ref.id.raw)

    /** Test-only: subscribe by the client-side id before the AttachmentRef exists. */
    fun uploadProgressByClientId(clientId: String): Flow<Progress> = bus.subscribe(clientId)

    private suspend fun generateThumbnailOrNull(file: FileInput, clientId: String): FileInput? {
        val gen = thumbnails ?: return null
        if (!ThumbnailSpec.isThumbnailable(file.mimeType)) return null
        return runCatching { gen.generate(file) }
            .onFailure {
                // Soft failure — upload the original anyway. The
                // validator surfaces a missing thumbnail later.
                bus.publish(clientId, Progress(0, file.sizeBytes, UploadState.Uploading))
            }
            .getOrNull()
    }

    private suspend fun uploadThumbnailOrNull(thumbnail: FileInput): String? =
        runCatching { storage.upload(thumbnail, "thumbnail") }.getOrNull()?.externalId

    private fun publishFailed(clientId: String, total: Long, cause: Throwable) {
        val message = cause.message?.takeIf { it.isNotBlank() } ?: "Upload failed"
        bus.publish(clientId, Progress(0, total, UploadState.Failed(message)))
    }

    private suspend fun safeRollback(originalExternalId: String, thumbnailExternalId: String?) {
        runCatching { storage.delete(originalExternalId) }
        if (thumbnailExternalId != null) {
            runCatching { storage.delete(thumbnailExternalId) }
        }
    }
}

