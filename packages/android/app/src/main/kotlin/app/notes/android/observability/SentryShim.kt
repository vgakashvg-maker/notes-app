package app.notes.android.observability

import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sentry boot shim. Lives behind a single-method interface so the real
 * SDK init lands in one place and tests can swap it out trivially. The
 * Sentry-Android SDK wire-up will land alongside the M14 release pipeline
 * verifying source-map uploads — for now we record the intent and rely on
 * the M14 observability stubs in the web shell to keep parity.
 */
@Singleton
class SentryShim @Inject constructor() {
    fun init(dsn: String) {
        if (dsn.isBlank()) {
            Log.i(TAG, "Sentry DSN not configured; observability disabled.")
            return
        }
        Log.i(TAG, "Sentry init pending — adapter scaffold only.")
    }

    private companion object {
        const val TAG = "Notes/Sentry"
    }
}
