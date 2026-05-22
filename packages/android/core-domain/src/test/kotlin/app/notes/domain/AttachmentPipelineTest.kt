package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AttachmentPipelineTest {
    @Test
    fun `UploadState Failed rejects blank message`() {
        assertThrows(IllegalArgumentException::class.java) { UploadState.Failed("  ") }
    }

    @Test
    fun `Progress rejects bytesSent greater than bytesTotal`() {
        assertThrows(IllegalArgumentException::class.java) {
            Progress(bytesSent = 11, bytesTotal = 10, state = UploadState.Uploading)
        }
    }

    @Test
    fun `Progress rejects negative bytesSent`() {
        assertThrows(IllegalArgumentException::class.java) {
            Progress(bytesSent = -1, bytesTotal = 10, state = UploadState.Uploading)
        }
    }

    @Test
    fun `Progress accepts a sane tuple`() {
        val p = Progress(1024, 2048, UploadState.Uploading)
        assertEquals(1024, p.bytesSent)
        assertEquals(2048, p.bytesTotal)
    }

    @Test
    fun `ThumbnailSpec pins the shared dimensions`() {
        assertEquals(800, ThumbnailSpec.MAX_LONGEST_EDGE_PX)
        assertEquals(80, ThumbnailSpec.JPEG_QUALITY)
    }

    @Test
    fun `isThumbnailable matches the listed image types`() {
        assertEquals(true, ThumbnailSpec.isThumbnailable("image/png"))
        assertEquals(false, ThumbnailSpec.isThumbnailable("application/pdf"))
    }
}
