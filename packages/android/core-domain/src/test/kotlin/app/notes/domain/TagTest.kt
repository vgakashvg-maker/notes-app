package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class TagTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val id = TagId("550e8400-e29b-41d4-a716-446655440003")
    private val now: Instant = Instant.parse("2026-05-20T12:00:00Z")

    @Test
    fun `accepts a valid tag`() {
        val tag = Tag(id, owner, "work", "#112233", now, now)
        assertEquals("work", tag.name)
    }

    @Test
    fun `rejects a blank name`() {
        assertThrows(IllegalArgumentException::class.java) {
            Tag(id, owner, "", "#112233", now, now)
        }
    }

    @Test
    fun `rejects a malformed color`() {
        assertThrows(IllegalArgumentException::class.java) {
            Tag(id, owner, "work", "#xyz", now, now)
        }
    }
}
