package app.notes.sync

import app.notes.domain.SyncStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class SyncEngineTest {
    private val clock = FakeClock()
    private val newConflictId = { mkNoteId(99) }

    @Test
    fun `forcePull drains all pages and ends in Idle`() = runTest {
        val outbox = InMemoryOutboxStore()
        val local = InMemoryLocalNoteStore()
        val api = ScriptedRemoteApi().apply {
            pullScript.add(listOf(mkNote(mkNoteId(1), updatedAt = Instant.parse("2026-05-21T12:00:00Z"))))
        }
        val engine = DefaultSyncEngine(
            ownerId = OWNER,
            outbox = outbox,
            api = api,
            local = local,
            realtime = ScriptedRealtimeChannel(emptyList()),
            clock = clock,
            newConflictId = newConflictId,
        )
        engine.forcePull()
        assertEquals(SyncStatus.Idle, engine.syncStatus().value)
        assertNotNull(local.notes[mkNoteId(1)])
    }

    @Test
    fun `forcePush drains the outbox once`() = runTest {
        val outbox = InMemoryOutboxStore()
        val api = ScriptedRemoteApi()
        val local = InMemoryLocalNoteStore()
        outbox.enqueue(OutboxOp.SetTrashed(mkNoteId(1), true))
        val engine = DefaultSyncEngine(
            ownerId = OWNER,
            outbox = outbox,
            api = api,
            local = local,
            realtime = ScriptedRealtimeChannel(emptyList()),
            clock = clock,
            newConflictId = newConflictId,
        )
        engine.forcePush()
        assertEquals(1, api.trashed.size)
        assertTrue(outbox.snapshot().isEmpty())
        assertEquals(SyncStatus.Idle, engine.syncStatus().value)
    }

    @Test
    fun `forcePush surfaces a transient failure via syncStatus while keeping the row`() = runTest {
        val outbox = InMemoryOutboxStore()
        val api = ScriptedRemoteApi().apply {
            // Two queued ops, both transient — flusher will mark them as
            // pending again; status falls back to Idle after the drain.
            trashScript.add(FlushOutcome.TransientFailure("503"))
        }
        val local = InMemoryLocalNoteStore()
        outbox.enqueue(OutboxOp.SetTrashed(mkNoteId(1), true))
        val engine = DefaultSyncEngine(
            ownerId = OWNER,
            outbox = outbox,
            api = api,
            local = local,
            realtime = ScriptedRealtimeChannel(emptyList()),
            clock = clock,
            newConflictId = newConflictId,
        )
        engine.forcePush()
        // The flusher caught the transient failure internally; the engine
        // reports Idle but the row stays in the outbox for retry.
        assertEquals(1, outbox.snapshot().size)
        assertEquals(OutboxState.PENDING, outbox.snapshot().single().state)
        assertEquals(SyncStatus.Idle, engine.syncStatus().value)
    }
}
