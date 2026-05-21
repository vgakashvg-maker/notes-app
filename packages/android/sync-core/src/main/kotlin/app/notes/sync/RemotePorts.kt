package app.notes.sync

import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.NotebookId
import app.notes.domain.UserId

/**
 * Wire-level port for the writer half of the sync engine. The Android
 * shell (M12) supplies an implementation that talks to PostgREST via
 * Ktor with the user's JWT.
 *
 * `applyXxx` returns a [FlushOutcome] so the engine doesn't have to know
 * how the binding turns HTTP into a verdict.
 */
interface RemoteNotesApi {
    suspend fun applyInsert(op: OutboxOp.Insert): FlushOutcome
    suspend fun applyUpdate(op: OutboxOp.Update): FlushOutcome
    suspend fun applySetTrashed(op: OutboxOp.SetTrashed): FlushOutcome
    suspend fun applyAddTag(op: OutboxOp.AddTag): FlushOutcome
    suspend fun applyRemoveTag(op: OutboxOp.RemoveTag): FlushOutcome

    /** Pulled notes for one page; called by the puller until a short page is returned. */
    suspend fun pullNotesSince(
        ownerId: UserId,
        sinceUpdatedAt: String?,
        limit: Int,
    ): List<Note>
}

/**
 * Port for the foreground-only Supabase Realtime subscription. M12 wraps
 * the SDK; tests emit synthetic events.
 */
interface RealtimeChannel {
    /**
     * Subscribe for the duration of [block]. Implementations must guarantee
     * the subscription is torn down on return / cancellation.
     */
    suspend fun subscribe(block: suspend (NoteRealtimeEvent) -> Unit)
}

/** A normalized realtime row change. */
sealed class NoteRealtimeEvent {
    abstract val note: Note

    data class Inserted(override val note: Note) : NoteRealtimeEvent()
    data class Updated(override val note: Note) : NoteRealtimeEvent()
    data class Deleted(override val note: Note) : NoteRealtimeEvent()
}

/**
 * Port for the local cache the engine writes to. M12 wires Room; tests
 * use an in-memory store.
 */
interface LocalNoteStore {
    suspend fun get(id: NoteId): Note?
    suspend fun upsert(note: Note)
    suspend fun delete(id: NoteId)
    suspend fun hasPendingOutbox(id: NoteId): Boolean
    suspend fun ensureConflictsNotebook(ownerId: UserId): NotebookId
    suspend fun insertConflictCopy(note: Note)
    /** The high-water mark for the next incremental pull. */
    suspend fun getPullWatermark(): String?
    suspend fun setPullWatermark(value: String)
}

/** Pure-test-friendly clock so JUnit can drive time deterministically. */
fun interface Clock {
    fun now(): java.time.Instant
}
