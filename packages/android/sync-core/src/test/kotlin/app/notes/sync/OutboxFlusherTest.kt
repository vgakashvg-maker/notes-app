package app.notes.sync

import app.notes.domain.TagId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class OutboxFlusherTest {
    private val clock = FakeClock()
    private val noteId = mkNoteId(1)

    @Test
    fun `Applied removes the row`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi()
        store.enqueue(OutboxOp.SetTrashed(noteId, true))
        val flusher = OutboxFlusher(store, api, clock)
        val outcomes = flusher.drainOnce()
        assertEquals(listOf<FlushOutcome>(FlushOutcome.Applied), outcomes)
        assertTrue(store.snapshot().isEmpty())
        assertEquals(1, api.trashed.size)
    }

    @Test
    fun `TransientFailure keeps the row PENDING and increments attempts`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi().apply {
            trashScript.add(FlushOutcome.TransientFailure("503"))
        }
        store.enqueue(OutboxOp.SetTrashed(noteId, true))
        val flusher = OutboxFlusher(store, api, clock)
        flusher.drainOnce()
        val row = store.snapshot().single()
        assertEquals(OutboxState.PENDING, row.state)
        assertEquals(1, row.attempts)
        assertEquals("503", row.lastError)
    }

    @Test
    fun `PermanentFailure parks the row in FAILED_PERMANENT`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi().apply {
            trashScript.add(FlushOutcome.PermanentFailure("400 bad request"))
        }
        store.enqueue(OutboxOp.SetTrashed(noteId, true))
        val flusher = OutboxFlusher(store, api, clock)
        flusher.drainOnce()
        val row = store.snapshot().single()
        assertEquals(OutboxState.FAILED_PERMANENT, row.state)
    }

    @Test
    fun `retry waits at least the backoff window`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi().apply {
            trashScript.add(FlushOutcome.TransientFailure("503"))
        }
        store.enqueue(OutboxOp.SetTrashed(noteId, true))
        val flusher = OutboxFlusher(store, api, clock)
        flusher.drainOnce() // attempts=1, lastAttempt=now
        // Immediately re-drain: nothing should be picked up because backoff window hasn't elapsed.
        flusher.drainOnce()
        assertEquals(1, api.trashed.size)
        // Advance past the first backoff slot (30s).
        clock.advanceSeconds(Backoff.SCHEDULE.first() + 1)
        // The next attempt actually applies (script is now empty → defaults to Applied).
        flusher.drainOnce()
        assertEquals(2, api.trashed.size)
        assertTrue(store.snapshot().isEmpty())
    }

    @Test
    fun `transient then applied removes the row idempotently`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi().apply {
            insertScript.add(FlushOutcome.TransientFailure("net"))
            // Next call returns Applied by default.
        }
        store.enqueue(
            OutboxOp.Insert(
                noteId = noteId,
                ownerId = OWNER,
                notebookId = NOTEBOOK,
                title = "n",
                bodyJson = "{}",
                tags = emptySet(),
                isPinned = false,
                createdAt = Instant.parse("2026-05-21T12:00:00Z"),
            ),
        )
        val flusher = OutboxFlusher(store, api, clock)
        flusher.drainOnce()
        clock.advanceSeconds(Backoff.SCHEDULE.first() + 1)
        flusher.drainOnce()
        assertEquals(2, api.inserts.size)
        assertTrue(store.snapshot().isEmpty())
    }

    @Test
    fun `409 from the remote is mapped to Applied via classifyHttpStatus`() {
        assertEquals(FlushOutcome.Applied, classifyHttpStatus(409, "duplicate"))
        assertEquals(FlushOutcome.Applied, classifyHttpStatus(201, "created"))
        assertTrue(classifyHttpStatus(500, "boom") is FlushOutcome.TransientFailure)
        assertTrue(classifyHttpStatus(400, "bad") is FlushOutcome.PermanentFailure)
        assertTrue(classifyHttpStatus(408, "timeout") is FlushOutcome.TransientFailure)
        assertTrue(classifyHttpStatus(429, "rate limited") is FlushOutcome.TransientFailure)
    }

    @Test
    fun `process-death revival promotes stale IN_FLIGHT rows back to PENDING`() = runTest {
        val store = InMemoryOutboxStore()
        store.seed(
            OutboxRow(
                id = "row-1",
                op = OutboxOp.SetTrashed(noteId, true),
                state = OutboxState.IN_FLIGHT,
                attempts = 1,
                createdAt = clock.now(),
                lastAttemptAt = clock.now(),
                lastError = null,
            ),
        )
        val api = ScriptedRemoteApi()
        val flusher = OutboxFlusher(store, api, clock, intervalSeconds = 30)
        // Simulate a fresh process: advance the clock beyond the IN_FLIGHT
        // timeout and run the revival path.
        clock.advanceSeconds(OutboxFlusher.IN_FLIGHT_TIMEOUT_S + 5)
        val revived = store.reviveStaleInFlight(clock.now(), OutboxFlusher.IN_FLIGHT_TIMEOUT_S)
        assertEquals(1, revived)
        flusher.drainOnce()
        assertEquals(1, api.trashed.size)
        assertTrue(store.snapshot().isEmpty())
    }

    @Test
    fun `multiple ops are dispatched FIFO by createdAt`() = runTest {
        val store = InMemoryOutboxStore()
        val api = ScriptedRemoteApi()
        val tag = TagId(mkNoteId(7).raw)
        // Manually seed two rows with controlled createdAt to be deterministic.
        store.seed(
            OutboxRow(
                id = "row-late",
                op = OutboxOp.SetTrashed(noteId, true),
                state = OutboxState.PENDING,
                attempts = 0,
                createdAt = Instant.parse("2026-05-21T13:00:00Z"),
                lastAttemptAt = null,
                lastError = null,
            ),
        )
        store.seed(
            OutboxRow(
                id = "row-early",
                op = OutboxOp.AddTag(noteId, tag),
                state = OutboxState.PENDING,
                attempts = 0,
                createdAt = Instant.parse("2026-05-21T12:00:00Z"),
                lastAttemptAt = null,
                lastError = null,
            ),
        )
        val flusher = OutboxFlusher(store, api, clock)
        flusher.drainOnce()
        // AddTag should have happened before SetTrashed.
        assertEquals(1, api.tagAdds.size)
        assertEquals(1, api.trashed.size)
    }
}
