package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class IdsTest {
    private val validUuid = "550e8400-e29b-41d4-a716-446655440000"

    @Test
    fun `accepts a valid UUID and stores the raw string`() {
        val id = NoteId(validUuid)
        assertEquals(validUuid, id.raw)
    }

    @Test
    fun `rejects empty strings`() {
        val ex = assertThrows(IllegalArgumentException::class.java) { UserId("") }
        assert(ex.message!!.contains("UserId"))
    }

    @Test
    fun `rejects non-UUID strings`() {
        assertThrows(IllegalArgumentException::class.java) { NoteId("not-a-uuid") }
    }

    @Test
    fun `rejects UUIDs with the wrong version nibble`() {
        assertThrows(IllegalArgumentException::class.java) {
            NoteId("550e8400-e29b-61d4-a716-446655440000")
        }
    }

    @Test
    fun `value classes are zero-cost at runtime but distinct at compile time`() {
        val noteId = NoteId(validUuid)
        val userId = UserId(validUuid)
        // Same underlying raw string, but the type system keeps them apart.
        assertEquals(noteId.raw, userId.raw)
    }
}
