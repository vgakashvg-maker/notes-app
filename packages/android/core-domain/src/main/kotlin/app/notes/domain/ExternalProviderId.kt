package app.notes.domain

/**
 * External OAuth providers whose access tokens we refresh on behalf of the
 * user. Lives in core-domain because storage (M03) and calendar (M08)
 * adapters need to name the same provider when asking the auth module for a
 * fresh token — without taking a dependency on the auth module itself.
 *
 * Distinct from [StorageProviderId] / [CalendarProviderId], which name the
 * abstract provider a user can pick. [ExternalProviderId] names a specific
 * OAuth scope bundle.
 */
sealed class ExternalProviderId(val wireName: String) {
    object GoogleDrive : ExternalProviderId("GOOGLE_DRIVE")
    object GoogleCalendar : ExternalProviderId("GOOGLE_CALENDAR")
    object GoogleUserinfo : ExternalProviderId("GOOGLE_USERINFO")

    companion object {
        val all: List<ExternalProviderId> = listOf(GoogleDrive, GoogleCalendar, GoogleUserinfo)
        fun fromWireName(name: String): ExternalProviderId =
            all.firstOrNull { it.wireName == name }
                ?: throw IllegalArgumentException(
                    "Unknown ExternalProviderId \"$name\"; expected one of ${all.joinToString { it.wireName }}",
                )
    }
}
