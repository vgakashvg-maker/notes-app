package app.notes.domain

import java.time.Instant

private val HEX_COLOR = Regex("^#[0-9a-f]{6}$", RegexOption.IGNORE_CASE)

internal fun requireHexColor(label: String, value: String) {
    require(HEX_COLOR.matches(value)) { "$label must be #RRGGBB hex, got \"$value\"" }
}

data class Notebook(
    val id: NotebookId,
    val ownerId: UserId,
    val name: String,
    val color: String,
    val sortOrder: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
) {
    init {
        require(name.isNotBlank()) { "Notebook.name cannot be empty" }
        requireHexColor("Notebook.color", color)
        require(sortOrder >= 0) { "Notebook.sortOrder must be >= 0" }
    }
}
