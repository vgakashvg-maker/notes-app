package app.notes.domain

import java.time.Instant

/** Opaque id for a row in `public.reminders`. */
@JvmInline
value class ReminderId(val raw: String) {
    init { require(raw.isNotBlank()) { "ReminderId cannot be empty" } }
}

enum class ReminderStatus(val wireName: String) {
    Scheduled("scheduled"),
    Fired("fired"),
    Cancelled("cancelled"),
    ;

    companion object {
        fun fromWire(name: String): ReminderStatus =
            entries.firstOrNull { it.wireName == name }
                ?: throw IllegalArgumentException("Unknown ReminderStatus \"$name\"")
    }
}

data class Reminder(
    val id: ReminderId,
    val ownerId: UserId,
    val noteId: NoteId? = null,
    val fireAt: Instant,
    val title: String,
    val body: String? = null,
    val status: ReminderStatus = ReminderStatus.Scheduled,
) {
    init { require(title.isNotBlank()) { "Reminder.title cannot be empty" } }
}

data class PushPayload(
    val title: String,
    val body: String,
    val data: Map<String, String> = emptyMap(),
) {
    init {
        require(title.isNotBlank()) { "PushPayload.title cannot be empty" }
        require(body.isNotBlank()) { "PushPayload.body cannot be empty" }
    }
}

/**
 * The notifications port. V1 implementations bind locally
 * (AlarmManager on Android; setTimeout + Web Notifications on web).
 * V2 swaps in `FcmNotificationProvider` behind the same shape.
 */
interface NotificationProvider {
    suspend fun scheduleLocal(reminder: Reminder)
    suspend fun cancelLocal(reminderId: ReminderId)
    /** V2 only — V1 impls throw NotImplementedError. */
    suspend fun sendPush(userId: UserId, payload: PushPayload)
}
