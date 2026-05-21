package app.notes.domain

data class EmbeddingChunk(
    val id: EmbeddingChunkId,
    val ownerId: UserId,
    val noteId: NoteId,
    val chunkIndex: Int,
    val content: String,
    val embedding: List<Float>,
    val namespace: String,
) {
    init {
        require(chunkIndex >= 0) { "EmbeddingChunk.chunkIndex must be >= 0" }
        require(content.isNotEmpty()) { "EmbeddingChunk.content cannot be empty" }
        require(embedding.isNotEmpty()) { "EmbeddingChunk.embedding cannot be empty" }
        require(embedding.all { it.isFinite() }) {
            "EmbeddingChunk.embedding entries must all be finite numbers"
        }
        require(namespace.isNotBlank()) { "EmbeddingChunk.namespace cannot be empty" }
    }
}
