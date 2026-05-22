package app.notes.domain

/**
 * Provider-agnostic AI value types — Kotlin twin of `packages/domain/src/ai.ts`.
 * The actual `AIProvider` / `AIServices` interfaces live in the
 * Android AI module because they use `Flow` (the same boundary we
 * keep for sync-core and attachments-android).
 */

enum class AICapability { STREAMING, EMBEDDINGS, VISION, TOOL_USE }

data class ModelDescriptor(
    val id: String,
    val contextTokens: Int,
    val supports: Set<AICapability>,
) {
    init {
        require(id.isNotBlank()) { "ModelDescriptor.id cannot be empty" }
        require(contextTokens > 0) { "ModelDescriptor.contextTokens must be > 0" }
    }
}

enum class MessageRole(val wireName: String) {
    SYSTEM("system"),
    USER("user"),
    ASSISTANT("assistant"),
    ;

    companion object {
        fun fromWire(name: String): MessageRole? = entries.firstOrNull { it.wireName == name }
    }
}

data class AIMessage(val role: MessageRole, val content: String) {
    init { require(content.isNotEmpty()) { "AIMessage.content cannot be empty" } }
}

data class AIOptions(
    val model: String,
    val temperature: Double? = null,
    val maxTokens: Int? = null,
    val stop: List<String> = emptyList(),
) {
    init {
        require(model.isNotBlank()) { "AIOptions.model cannot be empty" }
        if (temperature != null) require(temperature in 0.0..2.0) { "temperature must be in [0, 2]" }
        if (maxTokens != null) require(maxTokens > 0) { "maxTokens must be > 0" }
    }
}

data class AIResponse(
    val content: String,
    val model: String,
    val promptTokens: Int,
    val completionTokens: Int,
    val latencyMs: Long,
)

data class AIChunk(
    val delta: String,
    val done: Boolean,
    val model: String? = null,
    val promptTokens: Int? = null,
    val completionTokens: Int? = null,
)

data class ProviderHealth(
    val ok: Boolean,
    val message: String? = null,
    val latencyMs: Long? = null,
)

enum class SummaryLength { SHORT, MEDIUM, LONG }

data class NoteScope(
    val notebookIds: List<NotebookId>? = null,
    val tagIds: List<TagId>? = null,
    val excludeAi: Boolean = true,
)

/**
 * Unified streaming chunk type for the AIServices.chat() flow. Tagged
 * union via [kind]; readers `when (chunk.kind)`-dispatch.
 */
data class ChatChunk(
    val kind: Kind,
    val delta: String? = null,
    val noteId: NoteId? = null,
    val title: String? = null,
    val chunkIndex: Int? = null,
    val rank: Int? = null,
    val conversationId: ConversationId? = null,
    val tokens: ChunkTokens? = null,
    val model: String? = null,
    val latencyMs: Long? = null,
    val warning: String? = null,
) {
    enum class Kind { DELTA, CITATION, DONE, WARNING }
}

data class ChunkTokens(val prompt: Int, val completion: Int)

data class RelatedNote(
    val noteId: NoteId,
    val title: String,
    val snippet: String,
    val distance: Double,
)

data class Briefing(
    val date: String,
    val markdown: String,
    val model: String,
    val tokens: ChunkTokens,
)

data class AIConversation(
    val id: ConversationId,
    val title: String,
    val modelHint: String?,
    val createdAt: String,
    val lastMessageAt: String,
    val archivedSummary: String?,
    val messages: List<ConversationMessage>,
)

data class ConversationMessage(
    val id: String,
    val role: MessageRole,
    val content: String,
    val citations: List<Citation>,
    val provider: AIProviderId?,
    val model: String?,
    val promptTokens: Int,
    val completionTokens: Int,
    val createdAt: String,
)

data class Citation(
    val noteId: NoteId,
    val title: String,
    val chunkIndex: Int,
    val rank: Int,
)
