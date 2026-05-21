package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class UserTest {
    private val id = UserId("550e8400-e29b-41d4-a716-446655440000")

    private val defaultPrefs = AIPreferences(
        chatProvider = AIProviderId.Ollama,
        chatModel = "qwen2.5:7b",
        tagProvider = AIProviderId.Ollama,
        tagModel = "llama3.2:3b",
        embeddingProvider = AIProviderId.Ollama,
        embeddingModel = "nomic-embed-text",
    )

    private fun base(
        displayName: String = "Vgaka",
        storage: StorageProviderId? = StorageProviderId.GoogleDrive,
        calendar: CalendarProviderId? = CalendarProviderId.GoogleCalendar,
        prefs: AIPreferences = defaultPrefs,
    ) = User(id, displayName, storage, calendar, prefs, analyticsOptOut = false)

    @Test
    fun `accepts a valid user`() {
        assertEquals("Vgaka", base().displayName)
    }

    @Test
    fun `rejects a blank display name`() {
        assertThrows(IllegalArgumentException::class.java) { base(displayName = "") }
    }

    @Test
    fun `rejects empty model names in AIPreferences`() {
        assertThrows(IllegalArgumentException::class.java) {
            AIPreferences(
                chatProvider = AIProviderId.Ollama,
                chatModel = "",
                tagProvider = AIProviderId.Ollama,
                tagModel = "llama3.2:3b",
                embeddingProvider = AIProviderId.Ollama,
                embeddingModel = "nomic-embed-text",
            )
        }
    }
}
