package app.notes.sync

import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.NotebookId

/**
 * Conflict resolution between a remote pull (or realtime delivery) and the
 * local cache. Pure function — no I/O — so all branches are exhaustively
 * testable in JUnit. The orchestrator is responsible for applying the
 * [Resolution] to the [LocalNoteStore].
 *
 * See `docs/how-sync-works.md` and ADR 0006 for the policy rationale.
 */
object ConflictResolver {
    /**
     * Decide what to do with a remote note relative to the local cache.
     *
     * @param local      the cached note (may be null on first sight).
     * @param remote     the just-pulled / realtime-delivered note.
     * @param hasPending true iff the local note has an unflushed outbox
     *                   entry. Without a pending local change there is no
     *                   conflict — remote always wins outright.
     */
    fun resolve(
        local: Note?,
        remote: Note,
        hasPending: Boolean,
        conflictsNotebookId: NotebookId,
        newConflictId: () -> NoteId,
    ): Resolution {
        // First time we see this id, or the local copy is older / equal.
        if (local == null) return Resolution.AcceptRemote(remote)
        if (remote.updatedAt <= local.updatedAt) {
            // Server isn't ahead. Nothing to do — local already reflects
            // anything older than what we just pulled.
            return Resolution.NoOp
        }
        if (!hasPending) {
            // Remote is ahead and we have nothing in flight — straight
            // acceptance, no conflict to record.
            return Resolution.AcceptRemote(remote)
        }
        // Conflict: server is ahead AND we still owe it pending writes.
        // Body is remote-wins; preserve the local body as a conflict copy
        // in the dedicated notebook. Tags are unioned. Every other field
        // takes the remote value (see ADR 0006).
        val mergedTags = local.tags + remote.tags
        val merged = remote.copy(tags = mergedTags)
        val conflictCopy = Note(
            id = newConflictId(),
            ownerId = local.ownerId,
            notebookId = conflictsNotebookId,
            title = "[Conflict] ${local.title}",
            bodyJson = local.bodyJson,
            tags = local.tags,
            createdAt = local.createdAt,
            updatedAt = local.updatedAt,
            isPinned = false,
            isTrashed = false,
            trashedAt = null,
            aiExcluded = local.aiExcluded,
            attachmentRefs = local.attachmentRefs,
        )
        return Resolution.Conflict(merged = merged, conflictCopy = conflictCopy)
    }
}

sealed class Resolution {
    object NoOp : Resolution()
    data class AcceptRemote(val note: Note) : Resolution()
    data class Conflict(val merged: Note, val conflictCopy: Note) : Resolution()
}
