package app.notes.domain

import java.time.Instant

data class Tag(
    val id: TagId,
    val ownerId: UserId,
    val name: String,
    val color: String,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    init {
        require(name.isNotBlank()) { "Tag.name cannot be empty" }
        requireHexColor("Tag.color", color)
    }
}
