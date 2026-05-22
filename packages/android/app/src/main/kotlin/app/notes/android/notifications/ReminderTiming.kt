package app.notes.android.notifications

import app.notes.domain.Reminder
import app.notes.domain.ReminderStatus
import java.time.Duration
import java.time.Instant

/**
 * Pure-Kotlin twin of the web shell's `decideSchedule`. Used by the
 * boot rehydration walk + by tests to keep the scheduling decision
 * out of the AlarmManager binding.
 */
object ReminderTiming {

    val WINDOW = Duration.ofHours(24)

    sealed class Decision {
        data class FireNow(val reason: Reason) : Decision()
        data class Defer(val delay: Duration) : Decision()

        enum class Reason { MISSED, IN_WINDOW }
    }

    fun decide(reminder: Reminder, now: Instant = Instant.now()): Decision {
        if (reminder.status != ReminderStatus.Scheduled) {
            return Decision.Defer(Duration.ZERO)
        }
        val delay = Duration.between(now, reminder.fireAt)
        if (delay.isZero || delay.isNegative) {
            return Decision.FireNow(Decision.Reason.MISSED)
        }
        if (delay <= WINDOW) {
            return Decision.FireNow(Decision.Reason.IN_WINDOW)
        }
        return Decision.Defer(delay)
    }
}
