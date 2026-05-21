package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AttachmentRefTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val noteId = NoteId("550e8400-e29b-41d4-a716-446655440001")
    private val attId = AttachmentId("550e8400-e29b-41d4-a716-446655440010")

    private fun base(
        externalFileId: String = "drive-file-abc",
        mimeType: String = "application/pdf",
        sizeBytes: Long = 1024L,
        displayName: String = "spec.pdf",
    ) = AttachmentRef(
        id = attId,
        ownerId = owner,
        noteId = noteId,
        provider = StorageProviderId.GoogleDrive,
        externalFileId = externalFileId,
        mimeType = mimeType,
        sizeBytes = sizeBytes,
        displayName = displayName,
    )

    @Test
    fun `accepts a valid attachment`() {
        assertEquals(StorageProviderId.GoogleDrive, base().provider)
    }

    @Test
    fun `rejects a blank externalFileId`() {
        assertThrows(IllegalArgumentException::class.java) { base(externalFileId = "") }
    }

    @Test
    fun `rejects a malformed mimeType`() {
        assertThrows(IllegalArgumentException::class.java) { base(mimeType = "pdf") }
    }

    @Test
    fun `rejects a negative size`() {
        assertThrows(IllegalArgumentException::class.java) { base(sizeBytes = -1L) }
    }
}
