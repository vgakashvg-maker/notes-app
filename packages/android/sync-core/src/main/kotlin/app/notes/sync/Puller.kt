package app.notes.sync

import app.notes.domain.NoteId
import app.notes.domain.UserId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Incremental puller. Walks pages of `notes WHERE updated_at >= watermark`
 * until a short page is returned, applying each row through the
 * [ConflictResolver] before upserting locally. The watermark is advanced
 * after every successful page.
 *
 * Idempotent: replaying the same page is a no-op because every note's
 * resolution is determined by remote.updatedAt vs local.updatedAt.
 */
class Puller(
    private val ownerId: UserId,
    private val api: RemoteNotesApi,
    private val local: LocalNoteStore,
    private val clock: Clock,
    private val intervalSeconds: Long = 300,
    private val pageSize: Int = 500,
    private val newConflictId: () -> NoteId,
) {
    fun launchLoop(scope: CoroutineScope, foregrounded: () -> Boolean): Job = scope.launch {
        while (isActive) {
            if (foregrounded()) {
                runCatching { pullAll() }
            }
            delay(intervalSeconds * 1000)
        }
    }

    /** Drain all newer-than-watermark notes. Returns the number applied. */
    suspend fun pullAll(): Int {
        var applied = 0
        var watermark = local.getPullWatermark()
        val conflictsNotebookId = local.ensureConflictsNotebook(ownerId)
        while (true) {
            val page = api.pullNotesSince(ownerId, watermark, pageSize)
            if (page.isEmpty()) break
            for (remote in page) {
                val cached = local.get(remote.id)
                val hasPending = local.hasPendingOutbox(remote.id)
                when (val res = ConflictResolver.resolve(
                    local = cached,
                    remote = remote,
                    hasPending = hasPending,
                    conflictsNotebookId = conflictsNotebookId,
                    newConflictId = newConflictId,
                )) {
                    is Resolution.NoOp -> Unit
                    is Resolution.AcceptRemote -> {
                        local.upsert(res.note)
                        applied += 1
                    }
                    is Resolution.Conflict -> {
                        local.upsert(res.merged)
                        local.insertConflictCopy(res.conflictCopy)
                        applied += 1
                    }
                }
                watermark = maxIso(watermark, remote.updatedAt.toString())
            }
            if (watermark != null) local.setPullWatermark(watermark)
            if (page.size < pageSize) break
        }
        // Reference the clock so future ticks based on time can extend
        // this — the puller doesn't need it for correctness yet.
        clock.now()
        return applied
    }
}

internal fun maxIso(a: String?, b: String?): String? = when {
    a == null -> b
    b == null -> a
    a >= b -> a
    else -> b
}

/**
 * Foreground-only Realtime merger. Each delivered event runs through the
 * same conflict resolver as the puller, so realtime and pull cannot
 * diverge.
 */
class RealtimeMerger(
    private val ownerId: UserId,
    private val channel: RealtimeChannel,
    private val local: LocalNoteStore,
    private val newConflictId: () -> NoteId,
) {
    suspend fun runForeground() {
        val conflictsNotebookId = local.ensureConflictsNotebook(ownerId)
        channel.subscribe { event ->
            when (event) {
                is NoteRealtimeEvent.Deleted -> local.delete(event.note.id)
                is NoteRealtimeEvent.Inserted, is NoteRealtimeEvent.Updated -> {
                    val cached = local.get(event.note.id)
                    val hasPending = local.hasPendingOutbox(event.note.id)
                    when (val res = ConflictResolver.resolve(
                        local = cached,
                        remote = event.note,
                        hasPending = hasPending,
                        conflictsNotebookId = conflictsNotebookId,
                        newConflictId = newConflictId,
                    )) {
                        is Resolution.NoOp -> Unit
                        is Resolution.AcceptRemote -> local.upsert(res.note)
                        is Resolution.Conflict -> {
                            local.upsert(res.merged)
                            local.insertConflictCopy(res.conflictCopy)
                        }
                    }
                }
            }
        }
    }
}
