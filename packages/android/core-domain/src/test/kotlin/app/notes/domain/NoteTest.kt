package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class NoteTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val id = NoteId("550e8400-e29b-41d4-a716-446655440001")
    private val notebook = NotebookId("550e8400-e29b-41d4-a716-446655440002")
    private val tag = TagId("550e8400-e29b-41d4-a716-446655440003")
    private val now: Instant = Instant.parse("2026-05-20T12:00:00Z")

    private fun base(
        title: String = "Welcome",
        bodyJson: String = """{"type":"doc","content":[]}""",
        isTrashed: Boolean = false,
        trashedAt: Instant? = null,
    ) = Note(
        id = id,
        ownerId = owner,
        notebookId = notebook,
        title = title,
        bodyJson = bodyJson,
        tags = setOf(tag),
        createdAt = now,
        updatedAt = now,
        isPinned = false,
        isTrashed = isTrashed,
        trashedAt = trashedAt,
        aiExcluded = false,
        attachmentRefs = emptyList(),
    )

    @Test
    fun `accepts a valid note`() {
        assertEquals("Welcome", base().title)
    }

    @Test
    fun `rejects a blank title`() {
        assertThrows(IllegalArgumentException::class.java) { base(title = "  ") }
    }

    @Test
    fun `rejects invalid JSON in bodyJson`() {
        assertThrows(IllegalArgumentException::class.java) { base(bodyJson = "not json") }
    }

    @Test
    fun `requires trashedAt when isTrashed is true`() {
        assertThrows(IllegalArgumentException::class.java) {
            base(isTrashed = true, trashedAt = null)
        }
    }

    @Test
    fun `requires trashedAt to be null when isTrashed is false`() {
        assertThrows(IllegalArgumentException::class.java) {
            base(isTrashed = false, trashedAt = now)
        }
    }
}
