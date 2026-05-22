package app.notes.android.notifications

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.getSystemService
import app.notes.domain.NotificationProvider
import app.notes.domain.PushPayload
import app.notes.domain.Reminder
import app.notes.domain.ReminderId
import app.notes.domain.UserId

/**
 * V1 binding to AlarmManager. Each reminder schedules one
 * exact-and-allow-while-idle alarm; the [AlarmReceiver] turns the
 * intent into a system notification on the `notes.reminders` channel.
 *
 * V2 swaps in `FcmNotificationProvider` against the same port — this
 * file is the only one that needs replacing. The Hilt binding lives
 * in `app.notes.android.di.NotificationsModule`.
 */
class AndroidNotificationProvider(
    private val context: Context,
) : NotificationProvider {

    override suspend fun scheduleLocal(reminder: Reminder) {
        ensureChannel(context)
        val alarm = context.getSystemService<AlarmManager>() ?: return
        val pi = pendingIntentFor(context, reminder)
        val fireMs = reminder.fireAt.toEpochMilli()
        // setExactAndAllowWhileIdle survives Doze and works back to API 23.
        // The user is expected to grant SCHEDULE_EXACT_ALARM on API 31+;
        // on API 33+ the system prompts at first use.
        alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireMs, pi)
    }

    override suspend fun cancelLocal(reminderId: ReminderId) {
        val alarm = context.getSystemService<AlarmManager>() ?: return
        alarm.cancel(pendingIntentFor(context, reminderId))
    }

    override suspend fun sendPush(userId: UserId, payload: PushPayload) {
        // V2 — Firebase Cloud Messaging adapter lives behind this method.
        throw NotImplementedError("FCM push lands in V2; V1 wires only scheduleLocal/cancelLocal")
    }

    private fun pendingIntentFor(context: Context, reminder: Reminder): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra(AlarmReceiver.EXTRA_REMINDER_ID, reminder.id.raw)
            putExtra(AlarmReceiver.EXTRA_TITLE, reminder.title)
            putExtra(AlarmReceiver.EXTRA_BODY, reminder.body ?: "")
        }
        return PendingIntent.getBroadcast(
            context,
            reminder.id.raw.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun pendingIntentFor(context: Context, id: ReminderId): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra(AlarmReceiver.EXTRA_REMINDER_ID, id.raw)
        }
        return PendingIntent.getBroadcast(
            context,
            id.raw.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: PendingIntent.getBroadcast(
            context,
            id.raw.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val CHANNEL_ID = "notes.reminders"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val mgr = context.getSystemService(NotificationManager::class.java) ?: return
            if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Reminders",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Note-attached reminders that fire at a chosen time."
            }
            mgr.createNotificationChannel(channel)
        }

        fun canPostNotifications(context: Context): Boolean =
            NotificationManagerCompat.from(context).areNotificationsEnabled()
    }
}
