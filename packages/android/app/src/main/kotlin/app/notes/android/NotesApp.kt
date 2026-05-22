package app.notes.android

import android.app.Application
import app.notes.android.observability.SentryShim
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * Application composition root. Hilt builds the DI graph (one module per
 * port in app/di) and injects it here. Sentry init is delegated to a shim
 * so the Sentry SDK can be swapped without touching the start-up path.
 *
 * SyncEngine boot is deferred until the Room DAO + Supabase REST binding
 * land — the M05 engine is shape-ready, but plugging it in here requires
 * those bindings, which are tracked in PROGRESS as M12 follow-ups.
 */
@HiltAndroidApp
class NotesApp : Application() {
    @Inject lateinit var sentry: SentryShim

    override fun onCreate() {
        super.onCreate()
        sentry.init(BuildConfig.SENTRY_DSN)
    }
}
