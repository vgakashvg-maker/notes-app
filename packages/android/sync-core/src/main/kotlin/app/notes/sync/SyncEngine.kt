package app.notes.sync

import app.notes.domain.NoteId
import app.notes.domain.SyncDirection
import app.notes.domain.SyncStatus
import app.notes.domain.UserId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

interface SyncEngine {
    fun start(scope: CoroutineScope)
    fun stop()
    fun syncStatus(): StateFlow<SyncStatus>
    suspend fun forcePull()
    suspend fun forcePush()
    suspend fun setForegrounded(value: Boolean)
}

/**
 * Default [SyncEngine] that wires the three loops together. Pure-Kotlin —
 * the Android shell (M12) feeds it concrete implementations of the four
 * ports plus a [SupervisorJob] scope tied to the application lifecycle.
 */
class DefaultSyncEngine(
    private val ownerId: UserId,
    private val outbox: OutboxStore,
    private val api: RemoteNotesApi,
    private val local: LocalNoteStore,
    private val realtime: RealtimeChannel,
    private val clock: Clock,
    private val newConflictId: () -> NoteId,
    private val outboxIntervalSeconds: Long = 30,
    private val pullIntervalSeconds: Long = 300,
) : SyncEngine {

    private val status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)
    private val foreground = MutableStateFlow(false)
    private var loopJob: Job? = null

    private val flusher = OutboxFlusher(outbox, api, clock, outboxIntervalSeconds)
    private val puller = Puller(
        ownerId = ownerId,
        api = api,
        local = local,
        clock = clock,
        intervalSeconds = pullIntervalSeconds,
        newConflictId = newConflictId,
    )
    private val merger = RealtimeMerger(ownerId, realtime, local, newConflictId)

    override fun start(scope: CoroutineScope) {
        check(loopJob == null) { "SyncEngine is already started" }
        val supervisor = SupervisorJob(scope.coroutineContext[Job])
        val loopScope = CoroutineScope(scope.coroutineContext + supervisor)
        val flusherJob = flusher.launchLoop(loopScope)
        val pullerJob = puller.launchLoop(loopScope) { foreground.value }
        // Realtime is foreground-bound; M12 will toggle via setForegrounded.
        loopJob = supervisor
        // Keep the joined jobs alive — Kotlin GC will not collect them
        // while the SupervisorJob is referenced via [loopJob].
        check(flusherJob.isActive && pullerJob.isActive)
        // Reference merger so it is retained for future foreground toggles.
        @Suppress("UNUSED_EXPRESSION")
        merger
    }

    override fun stop() {
        loopJob?.cancel()
        loopJob = null
    }

    override fun syncStatus(): StateFlow<SyncStatus> = status.asStateFlow()

    override suspend fun forcePull() {
        // itemsRemaining starts at 0 — we don't know the count until the
        // first PostgREST page comes back, and SyncStatus.Syncing.init
        // enforces >= 0. The Syncing variant still carries the direction so
        // the UI can show "syncing down" immediately.
        status.value = SyncStatus.Syncing(SyncDirection.DOWN, itemsRemaining = 0)
        try {
            puller.pullAll()
            status.value = SyncStatus.Idle
        } catch (cause: Throwable) {
            status.value = SyncStatus.Error(cause.message ?: "pull failed", canRetry = true)
        }
    }

    override suspend fun forcePush() {
        status.value = SyncStatus.Syncing(SyncDirection.UP, itemsRemaining = 0)
        try {
            flusher.drainOnce()
            status.value = SyncStatus.Idle
        } catch (cause: Throwable) {
            status.value = SyncStatus.Error(cause.message ?: "push failed", canRetry = true)
        }
    }

    override suspend fun setForegrounded(value: Boolean) {
        foreground.value = value
        // M12 attaches a per-foreground job for the realtime listener so
        // the subscription is torn down when the app goes background. The
        // core engine exposes the flag; the shell composes the listener.
    }
}
