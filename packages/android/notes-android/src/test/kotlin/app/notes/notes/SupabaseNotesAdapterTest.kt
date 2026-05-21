package app.notes.notes

import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.Notebook
import app.notes.domain.NotebookId
import app.notes.domain.Tag
import app.notes.domain.TagId
import app.notes.domain.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class SupabaseNotesAdapterTest {
    private val owner = UserId("550e8400-e29b-41d4-a716-446655440000")
    private val noteId = NoteId("550e8400-e29b-41d4-a716-446655440001")
    private val notebookId = NotebookId("550e8400-e29b-41d4-a716-446655440002")
    private val tag1 = TagId("550e8400-e29b-41d4-a716-446655440003")
    private val tag2 = TagId("550e8400-e29b-41d4-a716-446655440004")
    private val now = Instant.parse("2026-05-20T12:00:00Z")

    private fun note(title: String = "Welcome") = Note(
        id = noteId,
        ownerId = owner,
        notebookId = notebookId,
        title = title,
        bodyJson = "{\"type\":\"doc\",\"content\":[]}",
        tags = emptySet(),
        createdAt = now,
        updatedAt = now,
        isPinned = false,
        isTrashed = false,
        trashedAt = null,
        aiExcluded = false,
        attachmentRefs = emptyList(),
    )

    private fun notebook(name: String = "Inbox") = Notebook(
        id = notebookId,
        ownerId = owner,
        name = name,
        color = "#aabbcc",
        sortOrder = 0,
        createdAt = now,
        updatedAt = now,
    )

    private fun tag(id: TagId = tag1, name: String = "work") = Tag(
        id = id,
        ownerId = owner,
        name = name,
        color = "#112233",
        createdAt = now,
        updatedAt = now,
    )

    @Test
    fun `createNote rejects invalid bodyJson before hitting the wire`() = runTest {
        val http = FakeHttp(insertNoteResult = note())
        val adapter = SupabaseNotesAdapter(http)
        assertThrows(IllegalArgumentException::class.java) {
            // runBlocking-style via runTest captures the throw because validation is synchronous
            kotlinx.coroutines.runBlocking {
                adapter.createNote(NewNoteInput(owner, "hi", "not json"))
            }
        }
        assertEquals(0, http.insertNoteCalls)
    }

    @Test
    fun `createNote returns the note from the wire`() = runTest {
        val http = FakeHttp(insertNoteResult = note(title = "First"))
        val adapter = SupabaseNotesAdapter(http)
        val n = adapter.createNote(NewNoteInput(owner, "First", "{}"))
        assertEquals("First", n.title)
    }

    @Test
    fun `updateNote enforces NotePatch invariants`() {
        assertThrows(IllegalArgumentException::class.java) { NotePatch() }
        assertThrows(IllegalArgumentException::class.java) { NotePatch(title = "  ") }
    }

    @Test
    fun `updateNote rejects malformed bodyJson patch`() = runTest {
        val http = FakeHttp(patchNoteResult = note())
        val adapter = SupabaseNotesAdapter(http)
        assertThrows(IllegalArgumentException::class.java) {
            kotlinx.coroutines.runBlocking {
                adapter.updateNote(noteId, NotePatch(bodyJson = "lol"))
            }
        }
    }

    @Test
    fun `trash and restore toggle the wire`() = runTest {
        val http = FakeHttp()
        val adapter = SupabaseNotesAdapter(http)
        adapter.trashNote(noteId)
        adapter.restoreNote(noteId)
        assertEquals(listOf(true, false), http.trashCalls)
    }

    @Test
    fun `listNotes propagates the paged result`() = runTest {
        val http = FakeHttp(notes = listOf(note()), total = 1)
        val adapter = SupabaseNotesAdapter(http)
        val result = adapter.listNotes(NoteFilter(), Page(0, 50))
        assertEquals(1, result.total)
        assertEquals(1, result.items.size)
    }

    @Test
    fun `getNote throws NotesNotFoundException on 404`() {
        val http = FakeHttp(noteById = null)
        val adapter = SupabaseNotesAdapter(http)
        val ex = assertThrows(NotesNotFoundException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.getNote(noteId) }
        }
        assertSame(noteId, ex.id)
    }

    @Test
    fun `searchKeyword returns empty list for blank query without wire`() = runTest {
        val http = FakeHttp()
        val adapter = SupabaseNotesAdapter(http)
        val hits = adapter.searchKeyword("  ", NoteFilter())
        assertTrue(hits.isEmpty())
        assertEquals(0, http.searchCalls)
    }

    @Test
    fun `searchKeyword orders by rank descending`() = runTest {
        val http = FakeHttp(
            hits = listOf(
                NoteHit(note(), "low", 0.1),
                NoteHit(note(), "high", 0.9),
            ),
        )
        val adapter = SupabaseNotesAdapter(http)
        val hits = adapter.searchKeyword("hello", NoteFilter())
        assertEquals(listOf(0.9, 0.1), hits.map { it.rank })
    }

    @Test
    fun `renameNotebook rejects blank names`() {
        val http = FakeHttp(notebookPatched = notebook())
        val adapter = SupabaseNotesAdapter(http)
        assertThrows(IllegalArgumentException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.renameNotebook(notebookId, "  ") }
        }
    }

    @Test
    fun `mergeTag rejects merging into itself`() {
        val http = FakeHttp()
        val adapter = SupabaseNotesAdapter(http)
        assertThrows(IllegalArgumentException::class.java) {
            kotlinx.coroutines.runBlocking { adapter.mergeTag(tag1, tag1) }
        }
    }

    @Test
    fun `mergeTag delegates to the wire for distinct tags`() = runTest {
        val http = FakeHttp()
        val adapter = SupabaseNotesAdapter(http)
        adapter.mergeTag(tag1, tag2)
        assertEquals(listOf(tag1 to tag2), http.mergeCalls)
    }

    @Test
    fun `createTag and createNotebook enforce non-empty names at the input layer`() {
        assertThrows(IllegalArgumentException::class.java) {
            NewTagInput(owner, "  ")
        }
        assertThrows(IllegalArgumentException::class.java) {
            NewNotebookInput(owner, "  ")
        }
    }

    @Test
    fun `Page enforces bounds`() {
        assertThrows(IllegalArgumentException::class.java) { Page(-1, 50) }
        assertThrows(IllegalArgumentException::class.java) { Page(0, 0) }
        assertThrows(IllegalArgumentException::class.java) { Page(0, 201) }
    }

    private inner class FakeHttp(
        val insertNoteResult: Note = note(),
        val patchNoteResult: Note = note(),
        val notes: List<Note> = emptyList(),
        val total: Int = 0,
        val noteById: Note? = note(),
        val hits: List<NoteHit> = emptyList(),
        val notebookPatched: Notebook = notebook(),
    ) : NotesHttp {
        var insertNoteCalls = 0
        val trashCalls = mutableListOf<Boolean>()
        var searchCalls = 0
        val mergeCalls = mutableListOf<Pair<TagId, TagId>>()

        override suspend fun selectNotes(filter: NoteFilter, page: Page): PagedResult<Note> =
            PagedResult(notes, total)

        override suspend fun selectNote(id: NoteId): Note? = noteById

        override suspend fun insertNote(input: NewNoteInput): Note {
            insertNoteCalls += 1
            return insertNoteResult
        }

        override suspend fun patchNote(id: NoteId, patch: NotePatch): Note = patchNoteResult
        override suspend fun setNoteTrashed(id: NoteId, isTrashed: Boolean) { trashCalls.add(isTrashed) }

        override suspend fun selectNotebooks(): List<Notebook> = listOf(notebook())
        override suspend fun insertNotebook(input: NewNotebookInput): Notebook = notebook()
        override suspend fun patchNotebook(id: NotebookId, name: String): Notebook = notebookPatched
        override suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?) {}

        override suspend fun selectTags(): List<Tag> = listOf(tag())
        override suspend fun insertTag(input: NewTagInput): Tag = tag()
        override suspend fun mergeTag(from: TagId, into: TagId) { mergeCalls.add(from to into) }

        override suspend fun searchNotes(q: String, filter: NoteFilter): List<NoteHit> {
            searchCalls += 1
            return hits
        }
    }
}
