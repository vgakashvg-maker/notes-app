package app.notes.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class CalendarEventTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val start: Instant = Instant.parse("2026-05-20T09:00:00Z")
    private val end: Instant = Instant.parse("2026-05-20T09:30:00Z")

    private fun base(
        externalEventId: String = "evt-1",
        title: String = "Standup",
        endAt: Instant = end,
    ) = CalendarEvent(
        ownerId = owner,
        provider = CalendarProviderId.GoogleCalendar,
        externalEventId = externalEventId,
        calendarId = "primary",
        title = title,
        startAt = start,
        endAt = endAt,
        payload = emptyMap(),
    )

    @Test
    fun `accepts a valid event`() {
        assertEquals("Standup", base().title)
    }

    @Test
    fun `rejects endAt before startAt`() {
        assertThrows(IllegalArgumentException::class.java) {
            base(endAt = Instant.parse("2026-05-20T08:00:00Z"))
        }
    }

    @Test
    fun `rejects a blank externalEventId`() {
        assertThrows(IllegalArgumentException::class.java) { base(externalEventId = "") }
    }
}
