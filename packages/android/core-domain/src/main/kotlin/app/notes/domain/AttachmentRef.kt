package app.notes.domain

private val MIME_REGEX = Regex("^[a-z0-9.+-]+/[a-z0-9.+-]+$", RegexOption.IGNORE_CASE)

data class AttachmentRef(
    val id: AttachmentId,
    val ownerId: UserId,
    val noteId: NoteId,
    val provider: StorageProviderId,
    val externalFileId: String,
    val mimeType: String,
    val sizeBytes: Long,
    val displayName: String,
    val thumbnailId: String? = null,
) {
    init {
        require(externalFileId.isNotBlank()) { "AttachmentRef.externalFileId cannot be empty" }
        require(MIME_REGEX.matches(mimeType)) {
            "AttachmentRef.mimeType must be type/subtype, got \"$mimeType\""
        }
        require(sizeBytes >= 0) { "AttachmentRef.sizeBytes must be >= 0" }
        require(displayName.isNotBlank()) { "AttachmentRef.displayName cannot be empty" }
    }
}
