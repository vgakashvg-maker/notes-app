package app.notes.android.notifications

import app.notes.domain.Reminder
import app.notes.domain.ReminderId
import app.notes.domain.ReminderStatus
import app.notes.domain.UserId
import java.time.Duration
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReminderTimingTest {

    private val owner = UserId("11111111-1111-4111-8111-111111111111")
    private val now = Instant.parse("2026-05-22T12:00:00Z")

    private fun reminder(fireAt: Instant, status: ReminderStatus = ReminderStatus.Scheduled): Reminder =
        Reminder(
            id = ReminderId("r-1"),
            ownerId = owner,
            fireAt = fireAt,
            title = "Standup",
            status = status,
        )

    @Test
    fun `fires now for missed reminders`() {
        val r = reminder(now.minusSeconds(60))
        val decision = ReminderTiming.decide(r, now)
        assertEquals(
            ReminderTiming.Decision.FireNow(ReminderTiming.Decision.Reason.MISSED),
            decision,
        )
    }

    @Test
    fun `fires now for in-window reminders`() {
        val r = reminder(now.plus(Duration.ofHours(3)))
        val decision = ReminderTiming.decide(r, now)
        assertEquals(
            ReminderTiming.Decision.FireNow(ReminderTiming.Decision.Reason.IN_WINDOW),
            decision,
        )
    }

    @Test
    fun `defers reminders past the 24h window`() {
        val r = reminder(now.plus(Duration.ofDays(3)))
        val decision = ReminderTiming.decide(r, now)
        assertTrue(decision is ReminderTiming.Decision.Defer)
        val delay = (decision as ReminderTiming.Decision.Defer).delay
        assertTrue(delay > ReminderTiming.WINDOW)
    }

    @Test
    fun `defers non-scheduled reminders without inspecting fireAt`() {
        val r = reminder(now.plus(Duration.ofHours(1)), ReminderStatus.Fired)
        val decision = ReminderTiming.decide(r, now)
        assertEquals(ReminderTiming.Decision.Defer(Duration.ZERO), decision)
    }
}
