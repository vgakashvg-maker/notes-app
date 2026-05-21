package app.notes.sync

import app.notes.domain.NoteId
import app.notes.domain.NotebookId
import app.notes.domain.TagId
import app.notes.domain.UserId
import java.time.Instant

/**
 * What a queued mutation does on the server. Each variant carries the full
 * payload needed to retry the request — the outbox row is the durable
 * source of truth, not the volatile in-memory note.
 */
sealed class OutboxOp {
    abstract val noteId: NoteId

    data class Insert(
        override val noteId: NoteId,
        val ownerId: UserId,
        val notebookId: NotebookId?,
        val title: String,
        val bodyJson: String,
        val tags: Set<TagId>,
        val isPinned: Boolean,
        val createdAt: Instant,
    ) : OutboxOp()

    data class Update(
        override val noteId: NoteId,
        val patch: NotePatchPayload,
    ) : OutboxOp()

    data class SetTrashed(
        override val noteId: NoteId,
        val isTrashed: Boolean,
    ) : OutboxOp()

    data class AddTag(override val noteId: NoteId, val tagId: TagId) : OutboxOp()

    data class RemoveTag(override val noteId: NoteId, val tagId: TagId) : OutboxOp()
}

data class NotePatchPayload(
    val title: String? = null,
    val bodyJson: String? = null,
    val notebookId: NotebookId? = null,
    val notebookIdSet: Boolean = false,
    val isPinned: Boolean? = null,
    val aiExcluded: Boolean? = null,
)

/** Persisted lifecycle of a queued mutation. */
enum class OutboxState { PENDING, IN_FLIGHT, FAILED_PERMANENT }

data class OutboxRow(
    val id: String,
    val op: OutboxOp,
    val state: OutboxState,
    val attempts: Int,
    val createdAt: Instant,
    val lastAttemptAt: Instant?,
    val lastError: String?,
) {
    init {
        require(id.isNotBlank()) { "OutboxRow.id cannot be empty" }
        require(attempts >= 0) { "OutboxRow.attempts must be >= 0" }
    }
}

/**
 * Outcome of a single attempted flush, mapped from the HTTP response.
 * The mapping rules live in OutboxFlusher.classifyHttpStatus().
 */
sealed class FlushOutcome {
    /** 2xx, or 409 (idempotent retry of an already-applied write). */
    object Applied : FlushOutcome()

    /** 5xx, timeout, transport error — keep the row, schedule a retry. */
    data class TransientFailure(val message: String) : FlushOutcome()

    /** 4xx that isn't 409 — the request is bad; don't keep retrying. */
    data class PermanentFailure(val message: String) : FlushOutcome()
}

/** Per-attempt backoff. Capped so the queue still gets retried daily-ish. */
object Backoff {
    /** seconds */
    val SCHEDULE: List<Long> = listOf(30, 120, 480, 1800, 7200, 21_600)

    fun nextDelaySeconds(attempts: Int): Long {
        if (attempts <= 0) return SCHEDULE.first()
        val idx = (attempts - 1).coerceAtMost(SCHEDULE.lastIndex)
        return SCHEDULE[idx]
    }
}

/**
 * Port for the durable outbox. The production binding is a Room DAO
 * (lands in M12 with the rest of the Android shell). Test fakes use an
 * in-memory ConcurrentHashMap.
 */
interface OutboxStore {
    suspend fun enqueue(op: OutboxOp): OutboxRow
    suspend fun listPending(): List<OutboxRow>
    suspend fun markInFlight(id: String, at: Instant)
    suspend fun remove(id: String)
    suspend fun markFailed(id: String, error: String, at: Instant, nextState: OutboxState)
    suspend fun reviveStaleInFlight(now: Instant, olderThanSeconds: Long): Int
}
