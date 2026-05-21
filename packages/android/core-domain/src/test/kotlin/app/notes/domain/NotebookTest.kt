package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class NotebookTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val id = NotebookId("550e8400-e29b-41d4-a716-446655440002")
    private val now: Instant = Instant.parse("2026-05-20T12:00:00Z")

    private fun base(
        name: String = "Inbox",
        color: String = "#aabbcc",
        sortOrder: Int = 0,
    ) = Notebook(id, owner, name, color, sortOrder, now, now)

    @Test
    fun `accepts a valid notebook`() {
        assertEquals("Inbox", base().name)
    }

    @Test
    fun `rejects a blank name`() {
        assertThrows(IllegalArgumentException::class.java) { base(name = "  ") }
    }

    @Test
    fun `rejects a malformed color`() {
        assertThrows(IllegalArgumentException::class.java) { base(color = "blue") }
    }

    @Test
    fun `rejects a negative sort order`() {
        assertThrows(IllegalArgumentException::class.java) { base(sortOrder = -1) }
    }
}
