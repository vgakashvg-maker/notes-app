package app.notes.sync

import app.notes.domain.AIPreferences
import app.notes.domain.AIProviderId
import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.NotebookId
import app.notes.domain.TagId
import app.notes.domain.User
import app.notes.domain.UserId
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

internal val OWNER = UserId("550e8400-e29b-41d4-a716-446655440000")
internal val NOTEBOOK = NotebookId("550e8400-e29b-41d4-a716-446655440002")
internal val CONFLICTS_NOTEBOOK = NotebookId("550e8400-e29b-41d4-a716-446655440099")
internal val DEFAULT_PREFS = AIPreferences(
    chatProvider = AIProviderId.Ollama,
    chatModel = "qwen2.5:7b",
    tagProvider = AIProviderId.Ollama,
    tagModel = "llama3.2:3b",
    embeddingProvider = AIProviderId.Ollama,
    embeddingModel = "nomic-embed-text",
)
internal val DEFAULT_USER = User(
    userId = OWNER,
    displayName = "Vgaka",
    storageProvider = null,
    calendarProvider = null,
    aiPrefs = DEFAULT_PREFS,
    analyticsOptOut = false,
)

internal fun mkNoteId(seed: Int): NoteId =
    NoteId("550e8400-e29b-41d4-a716-44665544${"%04d".format(seed)}")

internal fun mkNote(
    id: NoteId,
    title: String = "Note $id",
    bodyJson: String = "{\"type\":\"doc\",\"content\":[]}",
    updatedAt: Instant = Instant.parse("2026-05-21T12:00:00Z"),
    tags: Set<TagId> = emptySet(),
    isPinned: Boolean = false,
    isTrashed: Boolean = false,
    trashedAt: Instant? = null,
    notebookId: NotebookId? = NOTEBOOK,
): Note = Note(
    id = id,
    ownerId = OWNER,
    notebookId = notebookId,
    title = title,
    bodyJson = bodyJson,
    tags = tags,
    createdAt = updatedAt,
    updatedAt = updatedAt,
    isPinned = isPinned,
    isTrashed = isTrashed,
    trashedAt = trashedAt,
    aiExcluded = false,
    attachmentRefs = emptyList(),
)

internal class FakeClock(var instant: Instant = Instant.parse("2026-05-21T12:00:00Z")) : Clock {
    override fun now(): Instant = instant
    fun advanceSeconds(secs: Long) { instant = instant.plusSeconds(secs) }
}

internal class InMemoryOutboxStore : OutboxStore {
    private val rows = ConcurrentHashMap<String, OutboxRow>()

    override suspend fun enqueue(op: OutboxOp): OutboxRow {
        val row = OutboxRow(
            id = UUID.randomUUID().toString(),
            op = op,
            state = OutboxState.PENDING,
            attempts = 0,
            createdAt = Instant.now(),
            lastAttemptAt = null,
            lastError = null,
        )
        rows[row.id] = row
        return row
    }

    fun seed(row: OutboxRow) { rows[row.id] = row }

    override suspend fun listPending(): List<OutboxRow> = rows.values.toList()

    override suspend fun markInFlight(id: String, at: Instant) {
        val existing = rows[id] ?: return
        rows[id] = existing.copy(state = OutboxState.IN_FLIGHT, lastAttemptAt = at)
    }

    override suspend fun remove(id: String) { rows.remove(id) }

    override suspend fun markFailed(
        id: String,
        error: String,
        at: Instant,
        nextState: OutboxState,
    ) {
        val existing = rows[id] ?: return
        rows[id] = existing.copy(
            state = nextState,
            attempts = existing.attempts + 1,
            lastAttemptAt = at,
            lastError = error,
        )
    }

    override suspend fun reviveStaleInFlight(now: Instant, olderThanSeconds: Long): Int {
        var revived = 0
        for ((id, row) in rows) {
            if (row.state == OutboxState.IN_FLIGHT) {
                val last = row.lastAttemptAt ?: continue
                if (now.isAfter(last.plusSeconds(olderThanSeconds))) {
                    rows[id] = row.copy(state = OutboxState.PENDING)
                    revived += 1
                }
            }
        }
        return revived
    }

    fun snapshot(): List<OutboxRow> = rows.values.toList()
}

internal class InMemoryLocalNoteStore : LocalNoteStore {
    val notes = ConcurrentHashMap<NoteId, Note>()
    val pendingIds = mutableSetOf<NoteId>()
    val conflictsInserted = mutableListOf<Note>()
    var watermark: String? = null

    override suspend fun get(id: NoteId): Note? = notes[id]
    override suspend fun upsert(note: Note) { notes[note.id] = note }
    override suspend fun delete(id: NoteId) { notes.remove(id) }
    override suspend fun hasPendingOutbox(id: NoteId): Boolean = id in pendingIds
    override suspend fun ensureConflictsNotebook(ownerId: UserId): NotebookId = CONFLICTS_NOTEBOOK
    override suspend fun insertConflictCopy(note: Note) { conflictsInserted.add(note) }
    override suspend fun getPullWatermark(): String? = watermark
    override suspend fun setPullWatermark(value: String) { watermark = value }
}

/**
 * A scripted [RemoteNotesApi] — each method consults a per-op outcome
 * script so tests can simulate flaky networks, idempotent retries, and
 * permanent failures without HTTP plumbing.
 */
internal class ScriptedRemoteApi : RemoteNotesApi {
    val inserts = mutableListOf<OutboxOp.Insert>()
    val updates = mutableListOf<OutboxOp.Update>()
    val trashed = mutableListOf<OutboxOp.SetTrashed>()
    val tagAdds = mutableListOf<OutboxOp.AddTag>()
    val tagRemoves = mutableListOf<OutboxOp.RemoveTag>()
    var insertScript: ArrayDeque<FlushOutcome> = ArrayDeque()
    var updateScript: ArrayDeque<FlushOutcome> = ArrayDeque()
    var trashScript: ArrayDeque<FlushOutcome> = ArrayDeque()
    var pullScript: ArrayDeque<List<Note>> = ArrayDeque()

    override suspend fun applyInsert(op: OutboxOp.Insert): FlushOutcome {
        inserts.add(op)
        return insertScript.removeFirstOrNull() ?: FlushOutcome.Applied
    }

    override suspend fun applyUpdate(op: OutboxOp.Update): FlushOutcome {
        updates.add(op)
        return updateScript.removeFirstOrNull() ?: FlushOutcome.Applied
    }

    override suspend fun applySetTrashed(op: OutboxOp.SetTrashed): FlushOutcome {
        trashed.add(op)
        return trashScript.removeFirstOrNull() ?: FlushOutcome.Applied
    }

    override suspend fun applyAddTag(op: OutboxOp.AddTag): FlushOutcome {
        tagAdds.add(op)
        return FlushOutcome.Applied
    }

    override suspend fun applyRemoveTag(op: OutboxOp.RemoveTag): FlushOutcome {
        tagRemoves.add(op)
        return FlushOutcome.Applied
    }

    override suspend fun pullNotesSince(
        ownerId: UserId,
        sinceUpdatedAt: String?,
        limit: Int,
    ): List<Note> = pullScript.removeFirstOrNull() ?: emptyList()
}

internal class ScriptedRealtimeChannel(private val events: List<NoteRealtimeEvent>) : RealtimeChannel {
    override suspend fun subscribe(block: suspend (NoteRealtimeEvent) -> Unit) {
        for (event in events) block(event)
    }
}
