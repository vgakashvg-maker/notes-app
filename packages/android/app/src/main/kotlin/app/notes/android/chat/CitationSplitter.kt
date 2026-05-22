package app.notes.android.chat

/**
 * Splits a message body into text + citation segments, mirroring the
 * web shell's `splitWithCitations` in `packages/web/lib/chat/citations.ts`.
 * Validated `[[NoteId:UUID]]` markers (those with a matching `citation`
 * event from the server) become `Citation` segments; orphan markers
 * fall through as plain text rather than crashing.
 */

data class CitationEntry(
    val noteId: String,
    val title: String,
    val rank: Int,
)

sealed class RenderSegment {
    data class Text(val text: String) : RenderSegment()
    data class Citation(val noteId: String, val title: String, val rank: Int) : RenderSegment()
}

private val CITATION_RE = Regex("""\[\[NoteId:([^\]]+)\]\]""")

fun splitWithCitations(
    text: String,
    citations: Map<String, CitationEntry>,
): List<RenderSegment> {
    val out = mutableListOf<RenderSegment>()
    var cursor = 0
    for (match in CITATION_RE.findAll(text)) {
        val noteId = match.groupValues[1]
        val entry = citations[noteId] ?: continue
        if (match.range.first > cursor) {
            out.add(RenderSegment.Text(text.substring(cursor, match.range.first)))
        }
        out.add(RenderSegment.Citation(entry.noteId, entry.title, entry.rank))
        cursor = match.range.last + 1
    }
    if (cursor < text.length) {
        out.add(RenderSegment.Text(text.substring(cursor)))
    }
    return out
}
