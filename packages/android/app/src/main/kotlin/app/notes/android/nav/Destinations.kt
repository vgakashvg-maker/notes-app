package app.notes.android.nav

/**
 * Single source of truth for route strings. Strings, not sealed classes,
 * keep the wiring tiny — adding a route is one entry here and one
 * `composable(...)` block in [AppNavGraph].
 */
object Destinations {
    const val SIGN_IN = "sign-in"
    const val TODAY = "today"
    const val NOTES = "notes"
    const val EDITOR = "notes/{id}"
    const val SEARCH = "search"
    const val CHAT = "chat"
    const val SETTINGS = "settings"
    const val SETTINGS_AI_ENDPOINT = "settings/ai/endpoint"
    const val SETTINGS_AI_ROUTING = "settings/ai/routing"
    const val SETTINGS_AI_USAGE = "settings/ai/usage"

    fun editor(id: String): String = "notes/$id"
}
