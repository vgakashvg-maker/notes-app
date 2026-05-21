package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class EmbeddingChunkTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val note = NoteId("550e8400-e29b-41d4-a716-446655440001")
    private val chunk = EmbeddingChunkId("550e8400-e29b-41d4-a716-446655440020")

    private fun base(
        chunkIndex: Int = 0,
        content: String = "hello world",
        embedding: List<Float> = listOf(0.1f, 0.2f, 0.3f),
        namespace: String = "default",
    ) = EmbeddingChunk(chunk, owner, note, chunkIndex, content, embedding, namespace)

    @Test
    fun `accepts a valid chunk`() {
        assertEquals("hello world", base().content)
    }

    @Test
    fun `rejects a negative chunkIndex`() {
        assertThrows(IllegalArgumentException::class.java) { base(chunkIndex = -1) }
    }

    @Test
    fun `rejects an empty embedding`() {
        assertThrows(IllegalArgumentException::class.java) { base(embedding = emptyList()) }
    }

    @Test
    fun `rejects non-finite embedding values`() {
        assertThrows(IllegalArgumentException::class.java) {
            base(embedding = listOf(0.1f, Float.NaN))
        }
    }

    @Test
    fun `rejects a blank namespace`() {
        assertThrows(IllegalArgumentException::class.java) { base(namespace = "  ") }
    }
}
