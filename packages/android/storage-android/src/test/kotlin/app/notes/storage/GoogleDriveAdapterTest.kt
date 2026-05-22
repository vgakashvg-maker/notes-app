package app.notes.storage

import app.notes.domain.FileInput
import app.notes.domain.SIMPLE_UPLOAD_THRESHOLD_BYTES
import app.notes.domain.StorageError
import app.notes.domain.StorageException
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicInteger

private val ZERO_BACKOFF = BackoffConfig(
    maxAttempts = 3,
    baseDelayMs = 0,
    maxDelayMs = 0,
    delay = { _ -> },
    random = { 0.0 },
)

class GoogleDriveAdapterTest {
    private val tokenProvider: TokenProvider = { "ya29.token" }

    @Test
    fun `ensureAppFolder creates the folder when none exists and caches the id`() = runTest {
        val http = FakeDriveHttp(findResult = null)
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val id1 = adapter.ensureAppFolder()
        val id2 = adapter.ensureAppFolder()
        assertEquals(id1, id2)
        assertEquals("folder-xyz", id1)
        assertEquals(1, http.findCalls)
        assertEquals(1, http.createCalls)
    }

    @Test
    fun `ensureAppFolder returns the pre-existing folder without creating a duplicate`() = runTest {
        val http = FakeDriveHttp(findResult = "folder-existing")
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        assertEquals("folder-existing", adapter.ensureAppFolder())
        assertEquals(0, http.createCalls)
    }

    @Test
    fun `ensureAppFolder throws Unauthorized when no token is available`() = runTest {
        val adapter = GoogleDriveAdapter(FakeDriveHttp(), { null }, ZERO_BACKOFF)
        val ex = assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.ensureAppFolder() }
        }
        assertTrue(ex.error is StorageError.Unauthorized)
    }

    @Test
    fun `upload uses simpleUpload below the resumable threshold`() = runTest {
        val http = FakeDriveHttp()
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val remote = adapter.upload(
            FileInput(
                name = "small.pdf",
                mimeType = "application/pdf",
                sizeBytes = 4,
                bytes = byteArrayOf(1, 2, 3, 4),
            ),
        )
        assertEquals("file-1", remote.externalId)
        assertEquals(1, http.simpleUploadCalls)
        assertEquals(0, http.resumableStartCalls)
    }

    @Test
    fun `upload refuses simpleUpload when only a stream is provided under the threshold`() = runTest {
        val http = FakeDriveHttp()
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val ex = assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking {
                adapter.upload(
                    FileInput(
                        name = "small.pdf",
                        mimeType = "application/pdf",
                        sizeBytes = 4,
                        stream = { ByteArrayInputStream(byteArrayOf(1, 2, 3, 4)) },
                    ),
                )
            }
        }
        assertTrue(ex.error is StorageError.TransportError)
    }

    @Test
    fun `upload uses resumable path above the threshold and emits final metadata`() = runTest {
        val size = SIMPLE_UPLOAD_THRESHOLD_BYTES + 16
        val bytes = ByteArray(size.toInt())
        val http = FakeDriveHttp(
            putChunkBehaviour = { _, _, rangeStart, total ->
                if (rangeStart + size > total - 1) DriveFileMeta("file-resumable", "big.bin", "application/octet-stream", total)
                else null
            },
        )
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val remote = adapter.upload(
            FileInput(
                name = "big.bin",
                mimeType = "application/octet-stream",
                sizeBytes = size,
                stream = { ByteArrayInputStream(bytes) },
            ),
        )
        assertEquals(1, http.resumableStartCalls)
        assertTrue(http.putChunkCalls > 0)
        assertEquals(size, remote.sizeBytes)
    }

    @Test
    fun `upload throws TransportError when the stream is shorter than sizeBytes`() = runTest {
        val claimedSize = SIMPLE_UPLOAD_THRESHOLD_BYTES + 1024
        val actualBytes = ByteArray((SIMPLE_UPLOAD_THRESHOLD_BYTES + 16).toInt())
        val http = FakeDriveHttp(putChunkBehaviour = { _, _, _, _ -> null })
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val ex = assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking {
                adapter.upload(
                    FileInput(
                        name = "short.bin",
                        mimeType = "application/octet-stream",
                        sizeBytes = claimedSize,
                        stream = { ByteArrayInputStream(actualBytes) },
                    ),
                )
            }
        }
        assertTrue(ex.error is StorageError.TransportError)
    }

    @Test
    fun `getDownloadUrl embeds the token and pre-validates the file exists`() = runTest {
        val http = FakeDriveHttp()
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val url = adapter.getDownloadUrl("file-abc")
        assertTrue(url.contains("file-abc"))
        assertTrue(url.contains("access_token=ya29.token"))
        assertEquals(1, http.getMetadataCalls)
    }

    @Test
    fun `getDownloadUrl rejects ttl outside the (0, 3600) window`() = runTest {
        val adapter = GoogleDriveAdapter(FakeDriveHttp(), tokenProvider, ZERO_BACKOFF)
        assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.getDownloadUrl("file-abc", ttlSeconds = 0) }
        }
        assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.getDownloadUrl("file-abc", ttlSeconds = 4000) }
        }
    }

    @Test
    fun `retry on 5xx eventually succeeds`() = runTest {
        val attempts = AtomicInteger(0)
        val http = FakeDriveHttp(
            simpleUploadBehaviour = {
                val n = attempts.incrementAndGet()
                if (n < 3) throw StorageException(StorageError.UpstreamError(503, "Service Unavailable"))
                DriveFileMeta("file-retry", "f.bin", "application/octet-stream", 4)
            },
        )
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        val remote = adapter.upload(
            FileInput(name = "f.bin", mimeType = "application/octet-stream", sizeBytes = 4, bytes = ByteArray(4)),
        )
        assertEquals("file-retry", remote.externalId)
        assertEquals(3, attempts.get())
    }

    @Test
    fun `401 is not retried`() = runTest {
        val attempts = AtomicInteger(0)
        val http = FakeDriveHttp(
            simpleUploadBehaviour = {
                attempts.incrementAndGet()
                throw StorageException(StorageError.Unauthorized("Token expired"))
            },
        )
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking {
                adapter.upload(
                    FileInput("f", "application/octet-stream", 4, byteArrayOf(0, 0, 0, 0)),
                )
            }
        }
        assertEquals(1, attempts.get())
    }

    @Test
    fun `gives up after maxAttempts`() = runTest {
        val attempts = AtomicInteger(0)
        val http = FakeDriveHttp(
            simpleUploadBehaviour = {
                attempts.incrementAndGet()
                throw StorageException(StorageError.UpstreamError(503, "Service Unavailable"))
            },
        )
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        assertThrows(StorageException::class.java) {
            kotlinx.coroutines.runBlocking {
                adapter.upload(
                    FileInput("f", "application/octet-stream", 4, byteArrayOf(0, 0, 0, 0)),
                )
            }
        }
        // initial + 3 retries
        assertEquals(4, attempts.get())
    }

    @Test
    fun `delete forwards the externalId to the wire`() = runTest {
        val http = FakeDriveHttp()
        val adapter = GoogleDriveAdapter(http, tokenProvider, ZERO_BACKOFF)
        adapter.delete("file-abc")
        assertEquals(listOf("file-abc"), http.deletedIds)
    }
}

private class FakeDriveHttp(
    val findResult: String? = null,
    val simpleUploadBehaviour: suspend () -> DriveFileMeta = {
        DriveFileMeta("file-1", "spec.pdf", "application/pdf", 4)
    },
    val putChunkBehaviour: suspend (sessionUri: String, chunk: ByteArray, rangeStart: Long, totalSize: Long) -> DriveFileMeta? = { _, _, _, _ -> null },
) : DriveHttp {
    var findCalls = 0
    var createCalls = 0
    var simpleUploadCalls = 0
    var resumableStartCalls = 0
    var putChunkCalls = 0
    var getMetadataCalls = 0
    val deletedIds = mutableListOf<String>()

    override suspend fun findAppFolder(token: String, parentId: String?, name: String): String? {
        findCalls += 1
        return findResult
    }

    override suspend fun createFolder(token: String, parentId: String?, name: String): String {
        createCalls += 1
        return "folder-xyz"
    }

    override suspend fun simpleUpload(
        token: String,
        folderId: String,
        name: String,
        mimeType: String,
        bytes: ByteArray,
        folderHint: String?,
    ): DriveFileMeta {
        simpleUploadCalls += 1
        return simpleUploadBehaviour()
    }

    override suspend fun startResumableUpload(
        token: String,
        folderId: String,
        name: String,
        mimeType: String,
        sizeBytes: Long,
        folderHint: String?,
    ): ResumableUploadHandle {
        resumableStartCalls += 1
        return ResumableUploadHandle("https://drive/session")
    }

    override suspend fun putChunk(
        sessionUri: String,
        chunk: ByteArray,
        rangeStart: Long,
        totalSize: Long,
    ): DriveFileMeta? {
        putChunkCalls += 1
        return putChunkBehaviour(sessionUri, chunk, rangeStart, totalSize)
    }

    override suspend fun getMetadata(token: String, externalId: String): DriveFileMeta {
        getMetadataCalls += 1
        return DriveFileMeta(externalId, "spec.pdf", "application/pdf", 1024)
    }

    override suspend fun delete(token: String, externalId: String) {
        deletedIds.add(externalId)
    }
}
