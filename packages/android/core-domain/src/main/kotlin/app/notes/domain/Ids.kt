package app.notes.domain

/**
 * Opaque ID types. Each is a `@JvmInline value class` so it is erased to a
 * `String` at runtime but distinguishable from every other ID type at
 * compile time. Validation runs in the `init` block so an invalid raw value
 * fails fast at the call site.
 */

private val UUID_REGEX =
    Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

private fun requireUuid(label: String, raw: String) {
    require(raw.isNotEmpty()) { "$label cannot be empty" }
    require(UUID_REGEX.matches(raw)) { "$label must be a UUID, got \"$raw\"" }
}

@JvmInline
value class UserId(val raw: String) {
    init { requireUuid("UserId", raw) }
}

@JvmInline
value class NotebookId(val raw: String) {
    init { requireUuid("NotebookId", raw) }
}

@JvmInline
value class TagId(val raw: String) {
    init { requireUuid("TagId", raw) }
}

@JvmInline
value class NoteId(val raw: String) {
    init { requireUuid("NoteId", raw) }
}

@JvmInline
value class AttachmentId(val raw: String) {
    init { requireUuid("AttachmentId", raw) }
}

@JvmInline
value class EmbeddingChunkId(val raw: String) {
    init { requireUuid("EmbeddingChunkId", raw) }
}

@JvmInline
value class ConversationId(val raw: String) {
    init { requireUuid("ConversationId", raw) }
}
