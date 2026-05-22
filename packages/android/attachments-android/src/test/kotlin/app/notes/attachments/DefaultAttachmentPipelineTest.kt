package app.notes.attachments

import app.notes.domain.AttachmentId
import app.notes.domain.AttachmentRef
import app.notes.domain.FileInput
import app.notes.domain.NoteId
import app.notes.domain.Progress
import app.notes.domain.RemoteFile
import app.notes.domain.StorageProvider
import app.notes.domain.StorageProviderId
import app.notes.domain.UploadState
import app.notes.domain.UserId
import app.notes.domain.makeAttachmentRef
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DefaultAttachmentPipelineTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val note = NoteId("550e8400-e29b-41d4-a716-446655440001")
    private val attId = AttachmentId("550e8400-e29b-41d4-a716-446655440010")
    private val clientId = "01234567-89ab-4cde-8f01-23456789abcd"

    private val pdfFile = FileInput(
        name = "spec.pdf",
        mimeType = "application/pdf",
        sizeBytes = 1024,
        bytes = ByteArray(1024),
    )
    private val pngFile = FileInput(
        name = "photo.png",
        mimeType = "image/png",
        sizeBytes = 2048,
        bytes = ByteArray(2048),
    )
    private val thumbnailFile = FileInput(
        name = "photo.thumb.jpg",
        mimeType = "image/jpeg",
        sizeBytes = 256,
        bytes = ByteArray(256),
    )

    private fun sampleRef(externalFileId: String = "drive-original", thumbnailId: String? = null): AttachmentRef {
        val builder = AttachmentRef(
            id = attId,
            ownerId = owner,
            noteId = note,
            provider = StorageProviderId.GoogleDrive,
            externalFileId = externalFileId,
            mimeType = "application/pdf",
            sizeBytes = 1024,
            displayName = "spec.pdf",
            thumbnailId = thumbnailId,
        )
        return builder
    }

    @Test
    fun `attach uploads bytes inserts row returns AttachmentRef`() = runTest {
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        val ref = pipeline.attach(note, pdfFile)
        assertEquals("drive-original", ref.externalFileId)
        assertEquals(1, storage.uploadCalls)
        assertEquals(1, repo.insertCalls)
    }

    @Test
    fun `attach generates thumbnail for image MIME types and uploads both`() = runTest {
        val storage = FakeStorage(uploadFn = { _: FileInput, hint: String? ->
            val id = if (hint == "thumbnail") "drive-thumb" else "drive-original"
            RemoteFile(id, "f", "image/png", 100)
        })
        val repo = FakeRepo(insertResult = sampleRef(thumbnailId = "drive-thumb"))
        val thumbs = ThumbnailGenerator { thumbnailFile }
        val pipeline = DefaultAttachmentPipeline(storage, repo, thumbs, newClientId = { clientId })
        val ref = pipeline.attach(note, pngFile)
        assertEquals("drive-thumb", ref.thumbnailId)
        assertEquals(2, storage.uploadCalls)
    }

    @Test
    fun `attach does NOT generate thumbnail for non-image MIME`() = runTest {
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef())
        var thumbCalls = 0
        val thumbs = ThumbnailGenerator { thumbCalls += 1; thumbnailFile }
        val pipeline = DefaultAttachmentPipeline(storage, repo, thumbs, newClientId = { clientId })
        pipeline.attach(note, pdfFile)
        assertEquals(0, thumbCalls)
    }

    @Test
    fun `attach rolls back uploaded bytes when DB insert fails`() = runTest {
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef(), insertThrows = RuntimeException("RLS denied"))
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        assertThrows(RuntimeException::class.java) {
            kotlinx.coroutines.runBlocking { pipeline.attach(note, pdfFile) }
        }
        assertEquals(listOf("drive-original"), storage.deletedIds)
    }

    @Test
    fun `attach rolls back both files when DB insert fails after thumbnail upload`() = runTest {
        val storage = FakeStorage(uploadFn = { _: FileInput, hint: String? ->
            val id = if (hint == "thumbnail") "drive-thumb" else "drive-original"
            RemoteFile(id, "f", "image/png", 100)
        })
        val repo = FakeRepo(insertResult = sampleRef(), insertThrows = RuntimeException("RLS denied"))
        val thumbs = ThumbnailGenerator { thumbnailFile }
        val pipeline = DefaultAttachmentPipeline(storage, repo, thumbs, newClientId = { clientId })
        assertThrows(RuntimeException::class.java) {
            kotlinx.coroutines.runBlocking { pipeline.attach(note, pngFile) }
        }
        assertTrue("drive-original" in storage.deletedIds)
        assertTrue("drive-thumb" in storage.deletedIds)
    }

    @Test
    fun `attach proceeds with no thumbnail when thumbnail upload fails`() = runTest {
        var thumbAttempt = 0
        val storage = FakeStorage(uploadFn = { _: FileInput, hint: String? ->
            if (hint == "thumbnail") {
                thumbAttempt += 1
                throw RuntimeException("Drive 503 during thumbnail")
            }
            RemoteFile("drive-original", "f", "image/png", 100)
        })
        val repo = FakeRepo(insertResult = sampleRef())
        val thumbs = ThumbnailGenerator { thumbnailFile }
        val pipeline = DefaultAttachmentPipeline(storage, repo, thumbs, newClientId = { clientId })
        val ref = pipeline.attach(note, pngFile)
        assertEquals(1, thumbAttempt)
        assertNull(ref.thumbnailId)
        // The repo should have been called with thumbnailId = null.
        assertNull(repo.lastInsert?.thumbnailId)
    }

    @Test
    fun `attach proceeds when thumbnail GENERATOR fails`() = runTest {
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef())
        val thumbs = ThumbnailGenerator { throw RuntimeException("Canvas exploded") }
        val pipeline = DefaultAttachmentPipeline(storage, repo, thumbs, newClientId = { clientId })
        val ref = pipeline.attach(note, pngFile)
        assertNull(ref.thumbnailId)
        assertEquals(1, storage.uploadCalls)
    }

    @Test
    fun `attach publishes Failed when original upload fails and repo insert is NOT called`() = runTest {
        val storage = FakeStorage(uploadFn = { _: FileInput, _: String? -> throw RuntimeException("Drive 503") })
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        assertThrows(RuntimeException::class.java) {
            kotlinx.coroutines.runBlocking { pipeline.attach(note, pdfFile) }
        }
        assertEquals(0, repo.insertCalls)
    }

    @Test
    fun `uploadProgress ends in Done on successful attach`() = runTest {
        // Transition ordering (Pending → Uploading → Done) is verified on
        // the TS twin where the AsyncIterable contract is deterministic.
        // The Kotlin Flow + StandardTestDispatcher pair races on
        // subscribe-before-emit, so we verify the terminal state via the
        // bus's replay semantics instead.
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        pipeline.attach(note, pdfFile)
        val final = pipeline.uploadProgressByClientId(clientId).first()
        assertEquals(UploadState.Done, final.state)
    }

    @Test
    fun `uploadProgress ends in Failed on upload error`() = runTest {
        val storage = FakeStorage(uploadFn = { _: FileInput, _: String? -> throw RuntimeException("Drive 503") })
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        assertThrows(RuntimeException::class.java) {
            kotlinx.coroutines.runBlocking { pipeline.attach(note, pdfFile) }
        }
        val final = pipeline.uploadProgressByClientId(clientId).first()
        assertTrue(final.state is UploadState.Failed)
    }

    @Test
    fun `resolveUrl proxies to storage with the externalFileId`() = runTest {
        val storage = FakeStorage()
        val pipeline = DefaultAttachmentPipeline(storage, FakeRepo(insertResult = sampleRef()))
        val url = pipeline.resolveUrl(sampleRef())
        assertEquals("https://drive/drive-original", url)
        assertEquals(listOf("drive-original"), storage.metadataCalls)
    }

    @Test
    fun `remove deletes DB row then remote bytes`() = runTest {
        val order = mutableListOf<String>()
        val storage = FakeStorage(deleteFn = { id -> order.add("storage:$id") })
        val repo = FakeRepo(insertResult = sampleRef(), deleteFn = { id -> order.add("db:${id.raw}") })
        val pipeline = DefaultAttachmentPipeline(storage, repo)
        pipeline.remove(sampleRef(thumbnailId = "drive-thumb"))
        assertEquals(
            listOf("db:${attId.raw}", "storage:drive-original", "storage:drive-thumb"),
            order,
        )
    }

    @Test
    fun `remove swallows storage delete failures`() = runTest {
        val storage = FakeStorage(deleteFn = { _ -> throw RuntimeException("Drive 503") })
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo)
        pipeline.remove(sampleRef())
        assertEquals(1, repo.deleteCalls)
    }

    @Test
    fun `progress bus replays the latest value to a late subscriber`() = runTest {
        val storage = FakeStorage()
        val repo = FakeRepo(insertResult = sampleRef())
        val pipeline = DefaultAttachmentPipeline(storage, repo, newClientId = { clientId })
        pipeline.attach(note, pdfFile)
        // Subscribe AFTER the upload completed; should get the final Done snapshot.
        val first = pipeline.uploadProgressByClientId(clientId).first()
        assertNotNull(first)
        assertEquals(UploadState.Done, first.state)
    }
}

private class FakeStorage(
    private val uploadFn: suspend (FileInput, String?) -> RemoteFile = { file, _ ->
        RemoteFile("drive-original", file.name, file.mimeType, file.sizeBytes)
    },
    private val deleteFn: suspend (String) -> Unit = { _ -> },
) : StorageProvider {
    override val id = StorageProviderId.GoogleDrive
    var uploadCalls = 0
    val deletedIds = mutableListOf<String>()
    val metadataCalls = mutableListOf<String>()

    override suspend fun upload(file: FileInput, folderHint: String?): RemoteFile {
        uploadCalls += 1
        return uploadFn(file, folderHint)
    }

    override suspend fun delete(externalId: String) {
        deletedIds.add(externalId)
        deleteFn(externalId)
    }

    override suspend fun getDownloadUrl(externalId: String, ttlSeconds: Int): String {
        metadataCalls.add(externalId)
        return "https://drive/$externalId"
    }

    override suspend fun ensureAppFolder(): String = "folder-1"
}

private class FakeRepo(
    private val insertResult: AttachmentRef,
    private val insertThrows: Throwable? = null,
    private val deleteFn: suspend (AttachmentId) -> Unit = { _ -> },
) : AttachmentsRepo {
    var insertCalls = 0
    var deleteCalls = 0
    var lastInsert: NewAttachmentRefInput? = null

    override suspend fun insert(input: NewAttachmentRefInput): AttachmentRef {
        insertCalls += 1
        lastInsert = input
        insertThrows?.let { throw it }
        // Re-shape the result to reflect the input thumbnailId (so tests
        // that pass through can observe it on the returned ref).
        return AttachmentRef(
            id = insertResult.id,
            ownerId = insertResult.ownerId,
            noteId = insertResult.noteId,
            provider = insertResult.provider,
            externalFileId = input.externalId,
            mimeType = input.mimeType,
            sizeBytes = input.sizeBytes,
            displayName = input.displayName,
            thumbnailId = input.thumbnailId,
        )
    }

    override suspend fun delete(id: AttachmentId) {
        deleteCalls += 1
        deleteFn(id)
    }

    override suspend fun listForValidation(cursor: String?, limit: Int): ValidationPage =
        ValidationPage(emptyList(), null)

    override suspend fun recordDangling(entry: DanglingEntry) {}
}
