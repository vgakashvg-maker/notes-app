package app.notes.android.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CitationSplitterTest {

    @Test fun `returns the whole text when there are no markers`() {
        assertEquals(
            listOf(RenderSegment.Text("hello there")),
            splitWithCitations("hello there", emptyMap()),
        )
    }

    @Test fun `replaces a single marker with a citation segment`() {
        val citations = mapOf("n1" to CitationEntry("n1", "Note One", 1))
        val segs = splitWithCitations("before [[NoteId:n1]] after", citations)
        assertEquals(
            listOf(
                RenderSegment.Text("before "),
                RenderSegment.Citation("n1", "Note One", 1),
                RenderSegment.Text(" after"),
            ),
            segs,
        )
    }

    @Test fun `handles multiple markers in order`() {
        val citations = mapOf(
            "a" to CitationEntry("a", "A", 1),
            "b" to CitationEntry("b", "B", 2),
        )
        val segs = splitWithCitations("see [[NoteId:a]] and [[NoteId:b]].", citations)
        val citationsOnly = segs.filterIsInstance<RenderSegment.Citation>()
        assertEquals(2, citationsOnly.size)
        assertEquals(RenderSegment.Text("see "), segs.first())
        assertEquals(RenderSegment.Text("."), segs.last())
    }

    @Test fun `falls through markers with no matching citation entry`() {
        val segs = splitWithCitations("see [[NoteId:unknown]] now", emptyMap())
        assertEquals(listOf(RenderSegment.Text("see [[NoteId:unknown]] now")), segs)
    }

    @Test fun `preserves adjacency between markers with no in-between text`() {
        val citations = mapOf(
            "a" to CitationEntry("a", "A", 1),
            "b" to CitationEntry("b", "B", 2),
        )
        val segs = splitWithCitations("[[NoteId:a]][[NoteId:b]]", citations)
        assertEquals(
            listOf(
                RenderSegment.Citation("a", "A", 1),
                RenderSegment.Citation("b", "B", 2),
            ),
            segs,
        )
    }
}
