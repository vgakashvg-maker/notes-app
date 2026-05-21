package app.notes.sync

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class PullerTest {
    private val clock = FakeClock()
    private val noteId = mkNoteId(1)
    private val newConflictId = { mkNoteId(99) }

    @Test
    fun `applies an unseen remote note and advances the watermark`() = runTest {
        val store = InMemoryLocalNoteStore()
        val api = ScriptedRemoteApi().apply {
            pullScript.add(listOf(mkNote(noteId, updatedAt = Instant.parse("2026-05-21T12:00:00Z"))))
        }
        val puller = Puller(OWNER, api, store, clock, pageSize = 500, newConflictId = newConflictId)
        val applied = puller.pullAll()
        assertEquals(1, applied)
        assertEquals(noteId, store.notes[noteId]?.id)
        assertEquals("2026-05-21T12:00:00Z", store.watermark)
    }

    @Test
    fun `loops until a short page is returned`() = runTest {
        val store = InMemoryLocalNoteStore()
        val api = ScriptedRemoteApi().apply {
            // First page is full (500 hypothetical rows; we use 3 distinct UUIDs
            // and a pageSize of 3 so the same rule applies).
            val full = (0 until 3).map { mkNote(mkNoteId(it + 1), updatedAt = Instant.parse("2026-05-21T11:00:0$it" + "Z")) }
            pullScript.add(full)
            pullScript.add(listOf(mkNote(mkNoteId(4), updatedAt = Instant.parse("2026-05-21T11:01:00Z"))))
        }
        val puller = Puller(OWNER, api, store, clock, pageSize = 3, newConflictId = newConflictId)
        val applied = puller.pullAll()
        assertEquals(4, applied)
    }

    @Test
    fun `conflict resolution writes both the merged note and the conflict copy`() = runTest {
        val store = InMemoryLocalNoteStore()
        store.notes[noteId] = mkNote(
            noteId,
            title = "local title",
            bodyJson = "{\"local\":true}",
            updatedAt = Instant.parse("2026-05-21T11:00:00Z"),
        )
        store.pendingIds.add(noteId)
        val api = ScriptedRemoteApi().apply {
            pullScript.add(
                listOf(
                    mkNote(
                        noteId,
                        title = "remote title",
                        bodyJson = "{\"remote\":true}",
                        updatedAt = Instant.parse("2026-05-21T12:00:00Z"),
                    ),
                ),
            )
        }
        val puller = Puller(OWNER, api, store, clock, pageSize = 50, newConflictId = newConflictId)
        puller.pullAll()
        assertEquals("remote title", store.notes[noteId]?.title)
        assertEquals(1, store.conflictsInserted.size)
        assertEquals("[Conflict] local title", store.conflictsInserted.first().title)
    }

    @Test
    fun `no-op when the page is empty`() = runTest {
        val store = InMemoryLocalNoteStore()
        val api = ScriptedRemoteApi()
        val puller = Puller(OWNER, api, store, clock, pageSize = 500, newConflictId = newConflictId)
        assertEquals(0, puller.pullAll())
        assertTrue(store.notes.isEmpty())
    }

    @Test
    fun `realtime merger applies and handles conflicts the same way as the puller`() = runTest {
        val store = InMemoryLocalNoteStore()
        store.notes[noteId] = mkNote(
            noteId,
            title = "local title",
            bodyJson = "{\"local\":true}",
            updatedAt = Instant.parse("2026-05-21T11:00:00Z"),
        )
        store.pendingIds.add(noteId)
        val channel = ScriptedRealtimeChannel(
            listOf(
                NoteRealtimeEvent.Updated(
                    mkNote(
                        noteId,
                        title = "remote title",
                        bodyJson = "{\"remote\":true}",
                        updatedAt = Instant.parse("2026-05-21T12:00:00Z"),
                    ),
                ),
            ),
        )
        val merger = RealtimeMerger(OWNER, channel, store, newConflictId)
        merger.runForeground()
        assertEquals("remote title", store.notes[noteId]?.title)
        assertEquals(1, store.conflictsInserted.size)
    }

    @Test
    fun `realtime Deleted removes the local row`() = runTest {
        val store = InMemoryLocalNoteStore()
        store.notes[noteId] = mkNote(noteId)
        val channel = ScriptedRealtimeChannel(
            listOf(NoteRealtimeEvent.Deleted(mkNote(noteId))),
        )
        val merger = RealtimeMerger(OWNER, channel, store, newConflictId)
        merger.runForeground()
        assertTrue(store.notes.isEmpty())
    }
}
