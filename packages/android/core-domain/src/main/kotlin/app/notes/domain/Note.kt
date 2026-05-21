package app.notes.domain

import java.time.Instant

data class Note(
    val id: NoteId,
    val ownerId: UserId,
    val notebookId: NotebookId?,
    val title: String,
    val bodyJson: String,
    val tags: Set<TagId>,
    val createdAt: Instant,
    val updatedAt: Instant,
    val isPinned: Boolean,
    val isTrashed: Boolean,
    val trashedAt: Instant?,
    val aiExcluded: Boolean,
    val attachmentRefs: List<AttachmentRef>,
) {
    init {
        require(title.isNotBlank()) { "Note.title cannot be empty" }
        require(bodyJson.isJsonParseable()) { "Note.bodyJson must be valid JSON" }
        if (isTrashed) {
            require(trashedAt != null) { "Note.trashedAt must be set when isTrashed is true" }
        } else {
            require(trashedAt == null) { "Note.trashedAt must be null when isTrashed is false" }
        }
    }
}

/**
 * Validate that [this] is a parseable JSON value. We don't pull in a JSON
 * dependency in core-domain, so the validator is a tight recursive-descent
 * parser covering the full JSON grammar (RFC 8259) at the structural level.
 * Returns false for any byte sequence that the editor would refuse to
 * deserialise, including bare identifiers like "not json".
 */
fun String.isJsonParseable(): Boolean {
    val parser = JsonParser(this)
    parser.skipWs()
    if (!parser.value()) return false
    parser.skipWs()
    return parser.atEnd()
}

private class JsonParser(private val src: String) {
    private var pos: Int = 0

    fun atEnd(): Boolean = pos >= src.length

    fun skipWs() {
        while (pos < src.length && src[pos] in WS) pos += 1
    }

    fun value(): Boolean {
        skipWs()
        if (atEnd()) return false
        return when (src[pos]) {
            '{' -> obj()
            '[' -> arr()
            '"' -> str()
            't' -> literal("true")
            'f' -> literal("false")
            'n' -> literal("null")
            '-', in '0'..'9' -> number()
            else -> false
        }
    }

    private fun obj(): Boolean {
        // assumes src[pos] == '{'
        pos += 1
        skipWs()
        if (pos < src.length && src[pos] == '}') {
            pos += 1
            return true
        }
        while (true) {
            skipWs()
            if (pos >= src.length || src[pos] != '"') return false
            if (!str()) return false
            skipWs()
            if (pos >= src.length || src[pos] != ':') return false
            pos += 1
            if (!value()) return false
            skipWs()
            if (pos >= src.length) return false
            when (src[pos]) {
                ',' -> { pos += 1; continue }
                '}' -> { pos += 1; return true }
                else -> return false
            }
        }
    }

    private fun arr(): Boolean {
        // assumes src[pos] == '['
        pos += 1
        skipWs()
        if (pos < src.length && src[pos] == ']') {
            pos += 1
            return true
        }
        while (true) {
            if (!value()) return false
            skipWs()
            if (pos >= src.length) return false
            when (src[pos]) {
                ',' -> { pos += 1; continue }
                ']' -> { pos += 1; return true }
                else -> return false
            }
        }
    }

    private fun str(): Boolean {
        // assumes src[pos] == '"'
        pos += 1
        while (pos < src.length) {
            when (val c = src[pos]) {
                '"' -> { pos += 1; return true }
                '\\' -> {
                    if (pos + 1 >= src.length) return false
                    val esc = src[pos + 1]
                    if (esc == 'u') {
                        if (pos + 5 >= src.length) return false
                        for (i in 2..5) {
                            if (!src[pos + i].isHex()) return false
                        }
                        pos += 6
                    } else if (esc in ESC_CHARS) {
                        pos += 2
                    } else return false
                }
                else -> {
                    if (c.code < 0x20) return false
                    pos += 1
                }
            }
        }
        return false
    }

    private fun literal(lit: String): Boolean {
        if (pos + lit.length > src.length) return false
        for (i in lit.indices) {
            if (src[pos + i] != lit[i]) return false
        }
        pos += lit.length
        return true
    }

    private fun number(): Boolean {
        val start = pos
        if (src[pos] == '-') pos += 1
        if (pos >= src.length) return false
        if (src[pos] == '0') {
            pos += 1
        } else if (src[pos] in '1'..'9') {
            while (pos < src.length && src[pos] in '0'..'9') pos += 1
        } else return false
        if (pos < src.length && src[pos] == '.') {
            pos += 1
            if (pos >= src.length || src[pos] !in '0'..'9') return false
            while (pos < src.length && src[pos] in '0'..'9') pos += 1
        }
        if (pos < src.length && (src[pos] == 'e' || src[pos] == 'E')) {
            pos += 1
            if (pos < src.length && (src[pos] == '+' || src[pos] == '-')) pos += 1
            if (pos >= src.length || src[pos] !in '0'..'9') return false
            while (pos < src.length && src[pos] in '0'..'9') pos += 1
        }
        return pos > start
    }

    companion object {
        private val WS = setOf(' ', '\t', '\n', '\r')
        private val ESC_CHARS = setOf('"', '\\', '/', 'b', 'f', 'n', 'r', 't')
    }
}

private fun Char.isHex(): Boolean = this in '0'..'9' || this in 'a'..'f' || this in 'A'..'F'
