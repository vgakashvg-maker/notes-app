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
 * Lightweight JSON validity probe — we don't pull in a JSON dependency in
 * core-domain, so the check is structural: balanced braces / brackets,
 * starts with `{`/`[`/string/number/literal. The full parser lives in the
 * editor module that actually consumes the body.
 */
internal fun String.isJsonParseable(): Boolean {
    val trimmed = trim()
    if (trimmed.isEmpty()) return false
    val first = trimmed.first()
    if (first !in setOf('{', '[', '"', 't', 'f', 'n') && !first.isDigit() && first != '-') {
        return false
    }
    var depthCurly = 0
    var depthSquare = 0
    var inString = false
    var escape = false
    for (c in trimmed) {
        if (inString) {
            when {
                escape -> escape = false
                c == '\\' -> escape = true
                c == '"' -> inString = false
            }
            continue
        }
        when (c) {
            '"' -> inString = true
            '{' -> depthCurly++
            '}' -> if (--depthCurly < 0) return false
            '[' -> depthSquare++
            ']' -> if (--depthSquare < 0) return false
        }
    }
    return !inString && depthCurly == 0 && depthSquare == 0
}
