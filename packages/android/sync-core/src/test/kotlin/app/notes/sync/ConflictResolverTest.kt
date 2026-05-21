package app.notes.sync

import app.notes.domain.TagId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class ConflictResolverTest {
    private val noteId = mkNoteId(1)
    private val newConflictId = { mkNoteId(99) }

    @Test
    fun `first time we see a note, accept remote outright`() {
        val remote = mkNote(noteId)
        val res = ConflictResolver.resolve(
            local = null,
            remote = remote,
            hasPending = false,
            conflictsNotebookId = CONFLICTS_NOTEBOOK,
            newConflictId = newConflictId,
        )
        assertTrue(res is Resolution.AcceptRemote)
    }

    @Test
    fun `equal updated_at is a no-op`() {
        val ts = Instant.parse("2026-05-21T12:00:00Z")
        val local = mkNote(noteId, updatedAt = ts)
        val remote = mkNote(noteId, updatedAt = ts)
        val res = ConflictResolver.resolve(local, remote, hasPending = true, CONFLICTS_NOTEBOOK, newConflictId)
        assertSame(Resolution.NoOp, res)
    }

    @Test
    fun `older remote is a no-op`() {
        val local = mkNote(noteId, updatedAt = Instant.parse("2026-05-21T12:00:00Z"))
        val remote = mkNote(noteId, updatedAt = Instant.parse("2026-05-21T11:00:00Z"))
        val res = ConflictResolver.resolve(local, remote, hasPending = true, CONFLICTS_NOTEBOOK, newConflictId)
        assertSame(Resolution.NoOp, res)
    }

    @Test
    fun `newer remote without pending writes accepts outright`() {
        val local = mkNote(noteId, updatedAt = Instant.parse("2026-05-21T11:00:00Z"))
        val remote = mkNote(noteId, title = "new title", updatedAt = Instant.parse("2026-05-21T12:00:00Z"))
        val res = ConflictResolver.resolve(local, remote, hasPending = false, CONFLICTS_NOTEBOOK, newConflictId)
        assertTrue(res is Resolution.AcceptRemote)
        assertEquals("new title", (res as Resolution.AcceptRemote).note.title)
    }

    @Test
    fun `newer remote with pending writes triggers a Conflict — body remote-wins, local body saved to Conflicts notebook`() {
        val tagA = TagId(mkNoteId(10).raw) // reuse UUID shape
        val tagB = TagId(mkNoteId(11).raw)
        val local = mkNote(
            noteId,
            title = "local title",
            bodyJson = "{\"local\":true}",
            tags = setOf(tagA),
            updatedAt = Instant.parse("2026-05-21T11:00:00Z"),
        )
        val remote = mkNote(
            noteId,
            title = "remote title",
            bodyJson = "{\"remote\":true}",
            tags = setOf(tagB),
            updatedAt = Instant.parse("2026-05-21T12:00:00Z"),
        )
        val res = ConflictResolver.resolve(local, remote, hasPending = true, CONFLICTS_NOTEBOOK, newConflictId)
        assertTrue(res is Resolution.Conflict)
        res as Resolution.Conflict
        // Body and title: remote wins on the merged note.
        assertEquals("{\"remote\":true}", res.merged.bodyJson)
        assertEquals("remote title", res.merged.title)
        // Tags: union.
        assertEquals(setOf(tagA, tagB), res.merged.tags)
        // The local body is preserved in a conflict copy with the labelled title.
        assertEquals("[Conflict] local title", res.conflictCopy.title)
        assertEquals("{\"local\":true}", res.conflictCopy.bodyJson)
        assertEquals(CONFLICTS_NOTEBOOK, res.conflictCopy.notebookId)
    }

    @Test
    fun `Conflict preserves is_pinned and is_trashed from remote`() {
        val local = mkNote(noteId, isPinned = true, updatedAt = Instant.parse("2026-05-21T11:00:00Z"))
        val remote = mkNote(noteId, isPinned = false, updatedAt = Instant.parse("2026-05-21T12:00:00Z"))
        val res = ConflictResolver.resolve(local, remote, hasPending = true, CONFLICTS_NOTEBOOK, newConflictId)
        assertTrue(res is Resolution.Conflict)
        assertEquals(false, (res as Resolution.Conflict).merged.isPinned)
    }
}
