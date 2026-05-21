package app.notes.notes

import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.Notebook
import app.notes.domain.NotebookId
import app.notes.domain.Tag
import app.notes.domain.TagId
import app.notes.domain.isJsonParseable

/**
 * V1 [NotesService] implementation. Talks to Supabase via a thin
 * [NotesHttp] port that the M12 Android shell wires to a real
 * supabase-kt + Ktor client. Pure-JVM testable.
 */
class SupabaseNotesAdapter(private val http: NotesHttp) : NotesService {
    override suspend fun createNote(input: NewNoteInput): Note {
        validateJson("NewNoteInput.bodyJson", input.bodyJson)
        return http.insertNote(input)
    }

    override suspend fun updateNote(id: NoteId, patch: NotePatch): Note {
        patch.bodyJson?.let { validateJson("NotePatch.bodyJson", it) }
        return http.patchNote(id, patch)
    }

    override suspend fun trashNote(id: NoteId) {
        http.setNoteTrashed(id, isTrashed = true)
    }

    override suspend fun restoreNote(id: NoteId) {
        http.setNoteTrashed(id, isTrashed = false)
    }

    override suspend fun listNotes(filter: NoteFilter, page: Page): PagedResult<Note> =
        http.selectNotes(filter, page)

    override suspend fun getNote(id: NoteId): Note =
        http.selectNote(id) ?: throw NotesNotFoundException(id)

    override suspend fun searchKeyword(q: String, filter: NoteFilter): List<NoteHit> {
        if (q.isBlank()) return emptyList()
        return http.searchNotes(q, filter).sortedByDescending { it.rank }
    }

    override suspend fun createNotebook(input: NewNotebookInput): Notebook =
        http.insertNotebook(input)

    override suspend fun listNotebooks(): List<Notebook> = http.selectNotebooks()

    override suspend fun renameNotebook(id: NotebookId, name: String): Notebook {
        require(name.isNotBlank()) { "Notebook.name cannot be empty" }
        return http.patchNotebook(id, name)
    }

    override suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?) {
        http.deleteNotebook(id, moveNotesTo)
    }

    override suspend fun createTag(input: NewTagInput): Tag = http.insertTag(input)

    override suspend fun listTags(): List<Tag> = http.selectTags()

    override suspend fun mergeTag(from: TagId, into: TagId) {
        require(from != into) { "Cannot merge a tag into itself" }
        http.mergeTag(from, into)
    }

    private fun validateJson(field: String, value: String) {
        require(value.isJsonParseable()) { "$field must be valid JSON" }
    }
}

interface NotesHttp {
    suspend fun selectNotes(filter: NoteFilter, page: Page): PagedResult<Note>
    suspend fun selectNote(id: NoteId): Note?
    suspend fun insertNote(input: NewNoteInput): Note
    suspend fun patchNote(id: NoteId, patch: NotePatch): Note
    suspend fun setNoteTrashed(id: NoteId, isTrashed: Boolean)

    suspend fun selectNotebooks(): List<Notebook>
    suspend fun insertNotebook(input: NewNotebookInput): Notebook
    suspend fun patchNotebook(id: NotebookId, name: String): Notebook
    suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?)

    suspend fun selectTags(): List<Tag>
    suspend fun insertTag(input: NewTagInput): Tag
    suspend fun mergeTag(from: TagId, into: TagId)

    suspend fun searchNotes(q: String, filter: NoteFilter): List<NoteHit>
}
