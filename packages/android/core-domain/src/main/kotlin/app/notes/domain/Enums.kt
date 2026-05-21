package app.notes.domain

sealed class StorageProviderId(val wireName: String) {
    object GoogleDrive : StorageProviderId("GOOGLE_DRIVE")
    object OneDrive : StorageProviderId("ONEDRIVE")

    companion object {
        // `by lazy` is load-bearing here: a `val all = listOf(...)` initialised
        // in the companion runs before the nested `object` subclasses have
        // finished their own static initialisation, so the list ends up full of
        // nulls. Deferring with `by lazy` lets the JVM finish loading the
        // nested classes first.
        val all: List<StorageProviderId> by lazy { listOf(GoogleDrive, OneDrive) }
        fun fromWireName(name: String): StorageProviderId =
            all.firstOrNull { it.wireName == name }
                ?: throw IllegalArgumentException(
                    "Unknown StorageProviderId \"$name\"; expected one of ${all.joinToString { it.wireName }}",
                )
    }
}

sealed class CalendarProviderId(val wireName: String) {
    object GoogleCalendar : CalendarProviderId("GOOGLE_CALENDAR")
    object MicrosoftGraph : CalendarProviderId("MICROSOFT_GRAPH")

    companion object {
        val all: List<CalendarProviderId> by lazy { listOf(GoogleCalendar, MicrosoftGraph) }
        fun fromWireName(name: String): CalendarProviderId =
            all.firstOrNull { it.wireName == name }
                ?: throw IllegalArgumentException(
                    "Unknown CalendarProviderId \"$name\"; expected one of ${all.joinToString { it.wireName }}",
                )
    }
}

sealed class AIProviderId(val wireName: String) {
    object Ollama : AIProviderId("OLLAMA")
    object Anthropic : AIProviderId("ANTHROPIC")
    object OpenAI : AIProviderId("OPENAI")
    object Groq : AIProviderId("GROQ")

    companion object {
        val all: List<AIProviderId> by lazy { listOf(Ollama, Anthropic, OpenAI, Groq) }
        fun fromWireName(name: String): AIProviderId =
            all.firstOrNull { it.wireName == name }
                ?: throw IllegalArgumentException(
                    "Unknown AIProviderId \"$name\"; expected one of ${all.joinToString { it.wireName }}",
                )
    }
}

enum class SyncDirection { UP, DOWN, BOTH }

sealed class SyncStatus {
    object Idle : SyncStatus()

    data class Syncing(val direction: SyncDirection, val itemsRemaining: Int) : SyncStatus() {
        init { require(itemsRemaining >= 0) { "SyncStatus.Syncing.itemsRemaining must be >= 0" } }
    }

    data class Error(val message: String, val canRetry: Boolean) : SyncStatus() {
        init { require(message.isNotBlank()) { "SyncStatus.Error.message cannot be empty" } }
    }

    data class Conflict(val noteId: NoteId) : SyncStatus()
}
