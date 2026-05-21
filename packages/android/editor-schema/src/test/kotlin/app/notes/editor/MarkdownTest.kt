package app.notes.editor

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MarkdownTest {
    @Test
    fun `paragraph round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "paragraph",
                    content = listOf(DocNode(type = "text", text = "hello world")),
                ),
            ),
        )
        val md = jsonToMarkdown(doc)
        assertEquals("hello world", md)
        assertEquals(doc, markdownToJson(md))
    }

    @Test
    fun `heading round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "heading",
                    attrs = mapOf("level" to 2),
                    content = listOf(DocNode(type = "text", text = "Title")),
                ),
            ),
        )
        assertEquals("## Title", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("## Title"))
    }

    @Test
    fun `check list round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "check_list",
                    content = listOf(
                        DocNode(
                            type = "check_list_item",
                            attrs = mapOf("checked" to true),
                            content = listOf(
                                DocNode(
                                    type = "paragraph",
                                    content = listOf(DocNode(type = "text", text = "done")),
                                ),
                            ),
                        ),
                        DocNode(
                            type = "check_list_item",
                            attrs = mapOf("checked" to false),
                            content = listOf(
                                DocNode(
                                    type = "paragraph",
                                    content = listOf(DocNode(type = "text", text = "todo")),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
        val md = jsonToMarkdown(doc)
        assert(md.contains("- [x] done"))
        assert(md.contains("- [ ] todo"))
        assertEquals(doc, markdownToJson(md))
    }

    @Test
    fun `code block round-trips with language`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "code_block",
                    attrs = mapOf("language" to "ts"),
                    content = listOf(DocNode(type = "text", text = "const x = 1;")),
                ),
            ),
        )
        assertEquals("```ts\nconst x = 1;\n```", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("```ts\nconst x = 1;\n```"))
    }

    @Test
    fun `internal link round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "paragraph",
                    content = listOf(
                        DocNode(type = "text", text = "see "),
                        DocNode(type = "internal_link", attrs = mapOf("noteId" to "abc-123")),
                    ),
                ),
            ),
        )
        assertEquals("see [[note:abc-123]]", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("see [[note:abc-123]]"))
    }

    @Test
    fun `attachment block round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "attachment",
                    attrs = mapOf("attachmentId" to "att-1", "displayName" to "spec.pdf"),
                ),
            ),
        )
        assertEquals("[[attachment:att-1|spec.pdf]]", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("[[attachment:att-1|spec.pdf]]"))
    }

    @Test
    fun `empty markdown becomes empty doc`() {
        assertEquals(Doc.empty(), markdownToJson(""))
    }

    @Test
    fun `bold mark round-trips`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "paragraph",
                    content = listOf(
                        DocNode(
                            type = "text",
                            text = "loud",
                            marks = listOf(Mark(MarkName.BOLD)),
                        ),
                    ),
                ),
            ),
        )
        assertEquals("**loud**", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("**loud**"))
    }

    @Test
    fun `inline code with whitespace preserves content`() {
        val doc = Doc(
            listOf(
                DocNode(
                    type = "paragraph",
                    content = listOf(DocNode(type = "code_inline", text = "  ")),
                ),
            ),
        )
        // Two spaces between fences, no padding strip on round-trip.
        assertEquals("`  `", jsonToMarkdown(doc))
        assertEquals(doc, markdownToJson("`  `"))
    }
}
