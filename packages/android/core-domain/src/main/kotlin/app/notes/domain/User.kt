package app.notes.domain

data class AIPreferences(
    val chatProvider: AIProviderId,
    val chatModel: String,
    val tagProvider: AIProviderId,
    val tagModel: String,
    val embeddingProvider: AIProviderId,
    val embeddingModel: String,
) {
    init {
        require(chatModel.isNotBlank()) { "AIPreferences.chatModel cannot be empty" }
        require(tagModel.isNotBlank()) { "AIPreferences.tagModel cannot be empty" }
        require(embeddingModel.isNotBlank()) { "AIPreferences.embeddingModel cannot be empty" }
    }
}

data class User(
    val userId: UserId,
    val displayName: String,
    val storageProvider: StorageProviderId?,
    val calendarProvider: CalendarProviderId?,
    val aiPrefs: AIPreferences,
    val analyticsOptOut: Boolean,
) {
    init {
        require(displayName.isNotBlank()) { "User.displayName cannot be empty" }
    }
}
