package app.notes.notes

import app.notes.domain.Note
import app.notes.domain.NoteId
import app.notes.domain.Notebook
import app.notes.domain.NotebookId
import app.notes.domain.Tag
import app.notes.domain.TagId
import app.notes.domain.UserId

data class NewNoteInput(
    val ownerId: UserId,
    val title: String,
    val bodyJson: String,
    val notebookId: NotebookId? = null,
    val tags: Set<TagId> = emptySet(),
    val isPinned: Boolean = false,
) {
    init {
        require(title.isNotBlank()) { "Note.title cannot be empty" }
    }
}

data class NotePatch(
    val title: String? = null,
    val bodyJson: String? = null,
    val notebookId: NotebookId? = null,
    val notebookIdSet: Boolean = false,
    val tags: Set<TagId>? = null,
    val isPinned: Boolean? = null,
    val aiExcluded: Boolean? = null,
) {
    init {
        require(
            title != null || bodyJson != null || notebookIdSet
                || tags != null || isPinned != null || aiExcluded != null,
        ) { "NotePatch must contain at least one field" }
        title?.let { require(it.isNotBlank()) { "Note.title cannot be empty" } }
    }
}

data class NoteFilter(
    val notebookId: NotebookId? = null,
    val notebookIdSet: Boolean = false,
    val tagId: TagId? = null,
    val isTrashed: Boolean? = null,
    val isPinned: Boolean? = null,
)

data class Page(val offset: Int, val limit: Int) {
    init {
        require(offset >= 0) { "Page.offset must be >= 0" }
        require(limit in 1..200) { "Page.limit must be in (0, 200]" }
    }
}

data class PagedResult<T>(val items: List<T>, val total: Int)

data class NoteHit(val note: Note, val snippet: String, val rank: Double)

data class NewNotebookInput(
    val ownerId: UserId,
    val name: String,
    val color: String? = null,
    val sortOrder: Int? = null,
) {
    init { require(name.isNotBlank()) { "Notebook.name cannot be empty" } }
}

data class NewTagInput(val ownerId: UserId, val name: String, val color: String? = null) {
    init { require(name.isNotBlank()) { "Tag.name cannot be empty" } }
}

interface NotesService {
    suspend fun createNote(input: NewNoteInput): Note
    suspend fun updateNote(id: NoteId, patch: NotePatch): Note
    suspend fun trashNote(id: NoteId)
    suspend fun restoreNote(id: NoteId)
    suspend fun listNotes(filter: NoteFilter, page: Page): PagedResult<Note>
    suspend fun getNote(id: NoteId): Note
    suspend fun searchKeyword(q: String, filter: NoteFilter): List<NoteHit>

    suspend fun createNotebook(input: NewNotebookInput): Notebook
    suspend fun listNotebooks(): List<Notebook>
    suspend fun renameNotebook(id: NotebookId, name: String): Notebook
    suspend fun deleteNotebook(id: NotebookId, moveNotesTo: NotebookId?)

    suspend fun createTag(input: NewTagInput): Tag
    suspend fun listTags(): List<Tag>
    suspend fun mergeTag(from: TagId, into: TagId)
}

class NotesNotFoundException(val id: NoteId) :
    RuntimeException("Note ${id.raw} not found")
