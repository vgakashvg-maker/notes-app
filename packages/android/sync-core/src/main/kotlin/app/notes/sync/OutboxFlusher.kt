package app.notes.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/**
 * Drains the outbox FIFO-by-creation. Each pending row is dispatched to
 * the matching [RemoteNotesApi] method; the outcome is translated to an
 * [OutboxStore] mutation:
 *
 *   Applied            → remove row.
 *   PermanentFailure   → mark FAILED_PERMANENT with last_error.
 *   TransientFailure   → return to PENDING with attempts += 1; next attempt
 *                        waits [Backoff.nextDelaySeconds].
 *
 * Concurrency: the flusher serialises itself via a [Mutex]. The puller is
 * allowed to interleave because they operate on independent rows.
 *
 * Process-death safety: on construction the flusher reverts IN_FLIGHT
 * rows older than [IN_FLIGHT_TIMEOUT_S] back to PENDING, so an unclean
 * shutdown mid-attempt does not leave a row stuck.
 */
class OutboxFlusher(
    private val store: OutboxStore,
    private val api: RemoteNotesApi,
    private val clock: Clock,
    private val intervalSeconds: Long = 30,
) {
    private val mutex = Mutex()
    @Volatile var lastDrainAt: Instant? = null
        private set

    fun launchLoop(scope: CoroutineScope): Job = scope.launch {
        // Revive stale IN_FLIGHT rows once at startup.
        store.reviveStaleInFlight(clock.now(), IN_FLIGHT_TIMEOUT_S)
        while (isActive) {
            drainOnce()
            delay(intervalSeconds * 1000)
        }
    }

    /** Drain everything that's currently pending. Returns the per-row outcomes. */
    suspend fun drainOnce(): List<FlushOutcome> = mutex.withLock {
        val now = clock.now()
        lastDrainAt = now
        val rows = store.listPending()
            .filter { it.state == OutboxState.PENDING }
            .filter { readyAt(it).let { ready -> ready == null || !ready.isAfter(now) } }
            .sortedBy { it.createdAt }
        val outcomes = mutableListOf<FlushOutcome>()
        for (row in rows) {
            store.markInFlight(row.id, now)
            val outcome = try {
                dispatch(row.op)
            } catch (cause: Throwable) {
                FlushOutcome.TransientFailure(cause.message ?: cause::class.simpleName ?: "error")
            }
            applyOutcome(row, outcome, now)
            outcomes.add(outcome)
        }
        outcomes
    }

    /**
     * Compute the earliest moment the row is allowed to be retried after
     * its last failure. Rows that have never been attempted return null.
     */
    private fun readyAt(row: OutboxRow): Instant? {
        if (row.attempts == 0) return null
        val last = row.lastAttemptAt ?: return null
        val secs = Backoff.nextDelaySeconds(row.attempts)
        return last.plusSeconds(secs)
    }

    private suspend fun dispatch(op: OutboxOp): FlushOutcome = when (op) {
        is OutboxOp.Insert -> api.applyInsert(op)
        is OutboxOp.Update -> api.applyUpdate(op)
        is OutboxOp.SetTrashed -> api.applySetTrashed(op)
        is OutboxOp.AddTag -> api.applyAddTag(op)
        is OutboxOp.RemoveTag -> api.applyRemoveTag(op)
    }

    private suspend fun applyOutcome(row: OutboxRow, outcome: FlushOutcome, now: Instant) {
        when (outcome) {
            is FlushOutcome.Applied -> store.remove(row.id)
            is FlushOutcome.TransientFailure ->
                store.markFailed(row.id, outcome.message, now, OutboxState.PENDING)
            is FlushOutcome.PermanentFailure ->
                store.markFailed(row.id, outcome.message, now, OutboxState.FAILED_PERMANENT)
        }
    }

    companion object {
        /** A row in IN_FLIGHT longer than this on startup is considered orphaned. */
        const val IN_FLIGHT_TIMEOUT_S: Long = 60
    }
}

/**
 * Helper to classify a numeric HTTP status the way the flusher expects.
 * Lives next to the flusher so bindings can call it directly when they
 * implement [RemoteNotesApi] without re-deriving the rules.
 */
fun classifyHttpStatus(code: Int, message: String): FlushOutcome = when {
    code in 200..299 -> FlushOutcome.Applied
    code == 409 -> FlushOutcome.Applied // idempotent retry hit the PK
    code in 500..599 || code == 408 || code == 429 ->
        FlushOutcome.TransientFailure("HTTP $code: $message")
    code in 400..499 -> FlushOutcome.PermanentFailure("HTTP $code: $message")
    else -> FlushOutcome.TransientFailure("HTTP $code: $message")
}
