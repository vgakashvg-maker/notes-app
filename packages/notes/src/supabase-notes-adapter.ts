import type { Note, NoteId, Notebook, NotebookId, Tag, TagId } from "@notes-app/domain";
import { rowToNote, rowToNotebook, rowToTag, type NoteRow } from "./rows.js";
import { NotesNotFoundError, type NotesHttp } from "./notes-http.js";
import type {
  NewNoteInput,
  NewNotebookInput,
  NewTagInput,
  NoteFilter,
  NoteHit,
  NotePatch,
  NotesService,
  Page,
  PagedResult,
} from "./types.js";

export class SupabaseNotesAdapter implements NotesService {
  constructor(private readonly http: NotesHttp) {}

  async createNote(input: NewNoteInput): Promise<Note> {
    validateNewNote(input);
    const row = await this.http.insertNote(input);
    return rowToNote(row);
  }

  async updateNote(id: NoteId, patch: NotePatch): Promise<Note> {
    if (Object.keys(patch).length === 0) {
      throw new Error("NotePatch must contain at least one field");
    }
    if (patch.title !== undefined && patch.title.trim().length === 0) {
      throw new Error("Note.title cannot be empty");
    }
    if (patch.bodyJson !== undefined) {
      assertJson(patch.bodyJson, "NotePatch.bodyJson");
    }
    const row = await this.http.patchNote(id, patch);
    return rowToNote(row);
  }

  async trashNote(id: NoteId): Promise<void> {
    await this.http.setNoteTrashed(id, true);
  }

  async restoreNote(id: NoteId): Promise<void> {
    await this.http.setNoteTrashed(id, false);
  }

  async listNotes(filter: NoteFilter, page: Page): Promise<PagedResult<Note>> {
    assertPage(page);
    const { items, total } = await this.http.selectNotes(filter, page);
    return { items: items.map(rowToNote), total };
  }

  async getNote(id: NoteId): Promise<Note> {
    const row = await this.http.selectNote(id);
    if (row === null) throw new NotesNotFoundError(id);
    return rowToNote(row);
  }

  async searchKeyword(q: string, filter: NoteFilter): Promise<readonly NoteHit[]> {
    if (q.trim().length === 0) return [];
    const rows = await this.http.searchNotes(q, filter);
    // PostgREST may return unranked rows when ts_rank ties; preserve the
    // server's tie-break by sorting only when ranks disagree.
    const sorted = [...rows].sort((a, b) => b.rank - a.rank);
    return sorted.map(
      (row): NoteHit => ({
        note: rowToNote(stripHitFields(row)),
        snippet: row.snippet,
        rank: row.rank,
      }),
    );
  }

  async createNotebook(input: NewNotebookInput): Promise<Notebook> {
    if (input.name.trim().length === 0) {
      throw new Error("Notebook.name cannot be empty");
    }
    const row = await this.http.insertNotebook(input);
    return rowToNotebook(row);
  }

  async listNotebooks(): Promise<readonly Notebook[]> {
    const rows = await this.http.selectNotebooks();
    return rows.map(rowToNotebook);
  }

  async renameNotebook(id: NotebookId, name: string): Promise<Notebook> {
    if (name.trim().length === 0) {
      throw new Error("Notebook.name cannot be empty");
    }
    const row = await this.http.patchNotebook(id, { name });
    return rowToNotebook(row);
  }

  async deleteNotebook(id: NotebookId, moveNotesTo: NotebookId | null): Promise<void> {
    await this.http.deleteNotebook(id, moveNotesTo);
  }

  async createTag(input: NewTagInput): Promise<Tag> {
    if (input.name.trim().length === 0) {
      throw new Error("Tag.name cannot be empty");
    }
    const row = await this.http.insertTag(input);
    return rowToTag(row);
  }

  async listTags(): Promise<readonly Tag[]> {
    const rows = await this.http.selectTags();
    return rows.map(rowToTag);
  }

  async mergeTag(from: TagId, into: TagId): Promise<void> {
    if (from === into) {
      throw new Error("Cannot merge a tag into itself");
    }
    await this.http.mergeTag(from, into);
  }
}

function validateNewNote(input: NewNoteInput): void {
  if (input.title.trim().length === 0) {
    throw new Error("Note.title cannot be empty");
  }
  assertJson(input.bodyJson, "NewNoteInput.bodyJson");
}

function assertJson(value: string, field: string): void {
  try {
    JSON.parse(value);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
}

function assertPage(page: Page): void {
  if (!Number.isInteger(page.offset) || page.offset < 0) {
    throw new Error("Page.offset must be a non-negative integer");
  }
  if (!Number.isInteger(page.limit) || page.limit <= 0 || page.limit > 200) {
    throw new Error("Page.limit must be an integer in (0, 200]");
  }
}

function stripHitFields(row: NoteRow & { snippet?: string; rank?: number }): NoteRow {
  // The search RPC returns `snippet` and `rank` alongside the note columns;
  // rowToNote tolerates extras but explicit beats implicit.
  const { snippet: _s, rank: _r, ...rest } = row;
  void _s;
  void _r;
  return rest as NoteRow;
}
