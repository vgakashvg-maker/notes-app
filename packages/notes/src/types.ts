import type {
  Note,
  Notebook,
  NotebookId,
  NoteId,
  Tag,
  TagId,
  UserId,
} from "../../domain/src/index.ts";

export interface NewNoteInput {
  readonly ownerId: UserId;
  readonly title: string;
  readonly bodyJson: string;
  readonly notebookId?: NotebookId | null;
  readonly tags?: ReadonlySet<TagId>;
  readonly isPinned?: boolean;
}

export interface NotePatch {
  readonly title?: string;
  readonly bodyJson?: string;
  readonly notebookId?: NotebookId | null;
  readonly tags?: ReadonlySet<TagId>;
  readonly isPinned?: boolean;
  readonly aiExcluded?: boolean;
}

export interface NoteFilter {
  readonly notebookId?: NotebookId | null;
  readonly tagId?: TagId;
  readonly isTrashed?: boolean;
  readonly isPinned?: boolean;
}

export interface Page {
  readonly offset: number;
  readonly limit: number;
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** A keyword-search hit: the note plus a highlighted snippet and ts_rank. */
export interface NoteHit {
  readonly note: Note;
  readonly snippet: string;
  readonly rank: number;
}

/**
 * The Notes Core port. Owned by M04. Consumers (sync engine, editor, AI
 * services, …) depend on this interface only — never on the adapter.
 */
export interface NotesService {
  // Notes
  createNote(input: NewNoteInput): Promise<Note>;
  updateNote(id: NoteId, patch: NotePatch): Promise<Note>;
  trashNote(id: NoteId): Promise<void>;
  restoreNote(id: NoteId): Promise<void>;
  listNotes(filter: NoteFilter, page: Page): Promise<PagedResult<Note>>;
  getNote(id: NoteId): Promise<Note>;
  searchKeyword(q: string, filter: NoteFilter): Promise<readonly NoteHit[]>;

  // Notebooks
  createNotebook(input: NewNotebookInput): Promise<Notebook>;
  listNotebooks(): Promise<readonly Notebook[]>;
  renameNotebook(id: NotebookId, name: string): Promise<Notebook>;
  deleteNotebook(id: NotebookId, moveNotesTo: NotebookId | null): Promise<void>;

  // Tags
  createTag(input: NewTagInput): Promise<Tag>;
  listTags(): Promise<readonly Tag[]>;
  mergeTag(from: TagId, into: TagId): Promise<void>;
}

export interface NewNotebookInput {
  readonly ownerId: UserId;
  readonly name: string;
  readonly color?: string;
  readonly sortOrder?: number;
}

export interface NewTagInput {
  readonly ownerId: UserId;
  readonly name: string;
  readonly color?: string;
}

export const DEFAULT_COLOR = "#7c7c7c";
