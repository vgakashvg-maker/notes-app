package app.notes.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SchemaTest {
    @Test
    fun `block node catalogue is frozen`() {
        assertEquals(
            listOf("paragraph", "heading", "bullet_list", "ordered_list", "check_list", "code_block", "image", "attachment"),
            BlockNodeName.entries.map { it.wireName },
        )
    }

    @Test
    fun `inline node catalogue is frozen`() {
        assertEquals(
            listOf("text", "code_inline", "internal_link", "hard_break"),
            InlineNodeName.entries.map { it.wireName },
        )
    }

    @Test
    fun `mark catalogue is frozen`() {
        assertEquals(listOf("bold", "italic", "strike"), MarkName.entries.map { it.wireName })
    }

    @Test
    fun `SCHEMA_VERSION matches the TS twin`() {
        assertEquals(1, SCHEMA_VERSION)
    }

    @Test
    fun `Doc empty has a single paragraph`() {
        val doc = Doc.empty()
        assertEquals(1, doc.content.size)
        assertEquals("paragraph", doc.content.first().type)
    }
}
