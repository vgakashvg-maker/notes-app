package app.notes.domain

/** Opaque id for an event on the external provider (Google event.id etc.). */
@JvmInline
value class ExternalEventId(val raw: String) {
    init { require(raw.isNotBlank()) { "ExternalEventId cannot be empty" } }
}

data class DateRange(val start: java.time.Instant, val end: java.time.Instant) {
    init { require(!end.isBefore(start)) { "DateRange.end must be >= start" } }
}

data class NewEventInput(
    val title: String,
    val startAt: java.time.Instant,
    val endAt: java.time.Instant,
    val description: String? = null,
    val attendees: List<String> = emptyList(),
    val reminderMinutes: Int? = null,
    val noteId: NoteId? = null,
) {
    init {
        require(title.isNotBlank()) { "NewEventInput.title cannot be empty" }
        require(!endAt.isBefore(startAt)) { "NewEventInput.endAt must be >= startAt" }
    }
}

data class EventPatch(
    val title: String? = null,
    val startAt: java.time.Instant? = null,
    val endAt: java.time.Instant? = null,
    val description: String? = null,
)

sealed class CalendarChange {
    data class Upsert(val event: CalendarEvent) : CalendarChange()
    data class Delete(val externalEventId: ExternalEventId) : CalendarChange()
}

/**
 * The calendar port. V1 implementation is `GoogleCalendarAdapter`
 * (server-side, TS). V2 swaps in OutlookCalendarAdapter behind the same
 * shape. UI code never imports the adapter; the Edge Functions own all
 * server-side calls.
 */
interface CalendarProvider {
    val id: CalendarProviderId
    suspend fun listEvents(range: DateRange): List<CalendarEvent>
    suspend fun createEvent(input: NewEventInput): CalendarEvent
    suspend fun updateEvent(id: ExternalEventId, patch: EventPatch): CalendarEvent
    suspend fun deleteEvent(id: ExternalEventId)
    /**
     * V1 polling: return the set of CalendarChanges for the range. The
     * Android binding wraps this in a WorkManager periodic worker
     * (15-min cadence while foregrounded). V2 swaps in push channels —
     * the bindings change, the port stays.
     */
    suspend fun pollEvents(range: DateRange): List<CalendarChange>
}
