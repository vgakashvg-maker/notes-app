package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class StorageTest {
    @Test
    fun `RemoteFile invariants reject empty externalId or name`() {
        assertThrows(IllegalArgumentException::class.java) {
            RemoteFile(externalId = "", name = "a.pdf", mimeType = "application/pdf", sizeBytes = 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            RemoteFile(externalId = "id", name = "  ", mimeType = "application/pdf", sizeBytes = 1)
        }
    }

    @Test
    fun `FileInput requires either bytes or stream`() {
        assertThrows(IllegalArgumentException::class.java) {
            FileInput(name = "a.pdf", mimeType = "application/pdf", sizeBytes = 1)
        }
    }

    @Test
    fun `FileInput accepts bytes`() {
        val input = FileInput(
            name = "a.pdf",
            mimeType = "application/pdf",
            sizeBytes = 4,
            bytes = byteArrayOf(1, 2, 3, 4),
        )
        assertEquals(4, input.sizeBytes)
    }

    @Test
    fun `SIMPLE_UPLOAD_THRESHOLD_BYTES matches the spec's 5 MB cutover`() {
        assertEquals(5L * 1024L * 1024L, SIMPLE_UPLOAD_THRESHOLD_BYTES)
    }

    @Test
    fun `StorageException wraps an UpstreamError with its status code`() {
        val ex = StorageException(StorageError.UpstreamError(status = 503, message = "Backend down"))
        val cause = ex.error as StorageError.UpstreamError
        assertEquals(503, cause.status)
    }
}
