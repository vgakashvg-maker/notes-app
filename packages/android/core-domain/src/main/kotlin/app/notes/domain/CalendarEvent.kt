package app.notes.domain

import java.time.Instant

data class CalendarEvent(
    val ownerId: UserId,
    val provider: CalendarProviderId,
    val externalEventId: String,
    val calendarId: String,
    val title: String,
    val startAt: Instant,
    val endAt: Instant,
    val payload: Map<String, Any?>,
) {
    init {
        require(externalEventId.isNotBlank()) { "CalendarEvent.externalEventId cannot be empty" }
        require(calendarId.isNotBlank()) { "CalendarEvent.calendarId cannot be empty" }
        require(title.isNotBlank()) { "CalendarEvent.title cannot be empty" }
        require(!endAt.isBefore(startAt)) { "CalendarEvent.endAt must be >= startAt" }
    }
}
