package app.notes.editor

import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ValidateTest {
    @Test
    fun `accepts a minimal valid doc`() {
        validateDoc(Doc(listOf(DocNode(type = "paragraph"))))
    }

    @Test
    fun `rejects unknown block nodes`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(Doc(listOf(DocNode(type = "blockquote"))))
        }
    }

    @Test
    fun `rejects headings without a valid level`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(Doc(listOf(DocNode(type = "heading", attrs = mapOf("level" to 4)))))
        }
    }

    @Test
    fun `rejects lists with mismatched item types`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(
                Doc(
                    listOf(
                        DocNode(
                            type = "bullet_list",
                            content = listOf(
                                DocNode(
                                    type = "check_list_item",
                                    attrs = mapOf("checked" to false),
                                    content = listOf(DocNode(type = "paragraph")),
                                ),
                            ),
                        ),
                    ),
                ),
            )
        }
    }

    @Test
    fun `rejects check_list_item without boolean checked attr`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(
                Doc(
                    listOf(
                        DocNode(
                            type = "check_list",
                            content = listOf(
                                DocNode(
                                    type = "check_list_item",
                                    content = listOf(DocNode(type = "paragraph")),
                                ),
                            ),
                        ),
                    ),
                ),
            )
        }
    }

    @Test
    fun `rejects marks inside code_block`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(
                Doc(
                    listOf(
                        DocNode(
                            type = "code_block",
                            attrs = mapOf("language" to "js"),
                            content = listOf(
                                DocNode(type = "text", text = "hi", marks = listOf(Mark(MarkName.BOLD))),
                            ),
                        ),
                    ),
                ),
            )
        }
    }

    @Test
    fun `rejects empty text nodes`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(
                Doc(
                    listOf(
                        DocNode(
                            type = "paragraph",
                            content = listOf(DocNode(type = "text", text = "")),
                        ),
                    ),
                ),
            )
        }
    }

    @Test
    fun `rejects images without src`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(Doc(listOf(DocNode(type = "image", attrs = mapOf("alt" to "x")))))
        }
    }

    @Test
    fun `rejects attachments missing fields`() {
        assertThrows(SchemaValidationException::class.java) {
            validateDoc(Doc(listOf(DocNode(type = "attachment", attrs = mapOf("attachmentId" to "a")))))
        }
    }
}
