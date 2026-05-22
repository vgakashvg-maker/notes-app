package app.notes.android.notifications

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.content.getSystemService

/**
 * Receives the AlarmManager intent for a fired reminder and turns it
 * into a system notification on `notes.reminders` channel.
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Reminder"
        val body = intent.getStringExtra(EXTRA_BODY).orEmpty()

        AndroidNotificationProvider.ensureChannel(context)
        val notification = NotificationCompat.Builder(context, AndroidNotificationProvider.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()

        context.getSystemService<NotificationManager>()?.notify(id.hashCode(), notification)
    }

    companion object {
        const val EXTRA_REMINDER_ID = "reminderId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
    }
}
