package app.notes.android.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BOOT_COMPLETED fires after a reboot or a force-stop recovery; we use
 * it to rehydrate scheduled reminders from the local mirror (V1
 * defers the mirror itself to a follow-up — the receiver is the
 * binding seam).
 *
 * The current Stage-1 V1 wiring is intentionally a no-op so the
 * manifest entry compiles and the surface is verifiable end-to-end;
 * the rehydration walk that consumes a future `reminders` Room table
 * lands when the Android persistence binding does (same posture as the
 * M05 WorkManager workers).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        Log.i(TAG, "BOOT_COMPLETED — reminder rehydration scheduled for the Room binding follow-up.")
    }

    private companion object {
        const val TAG = "Notes/BootReceiver"
    }
}
