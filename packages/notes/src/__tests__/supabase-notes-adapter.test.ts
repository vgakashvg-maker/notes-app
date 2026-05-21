import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteId, NotebookId, TagId, UserId } from "@notes-app/domain";
import { SupabaseNotesAdapter } from "../supabase-notes-adapter.js";
import { NotesNotFoundError, type NotesHttp } from "../notes-http.js";
import type { NoteRow, NotebookRow, TagRow, NoteHitRow } from "../rows.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const NOTE = NoteId("550e8400-e29b-41d4-a716-446655440001");
const NOTEBOOK = NotebookId("550e8400-e29b-41d4-a716-446655440002");
const TAG = TagId("550e8400-e29b-41d4-a716-446655440003");
const TAG_2 = TagId("550e8400-e29b-41d4-a716-446655440004");

function makeNoteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: NOTE,
    owner_id: OWNER,
    notebook_id: NOTEBOOK,
    title: "Welcome",
    body_json: { type: "doc", content: [] },
    is_pinned: false,
    is_trashed: false,
    trashed_at: null,
    ai_excluded: false,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function makeNotebookRow(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: NOTEBOOK,
    owner_id: OWNER,
    name: "Inbox",
    color: "#aabbcc",
    sort_order: 0,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: TAG,
    owner_id: OWNER,
    name: "work",
    color: "#112233",
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function makeHttp(): NotesHttp {
  return {
    selectNotes: vi.fn(),
    selectNote: vi.fn(),
    insertNote: vi.fn(),
    patchNote: vi.fn(),
    setNoteTrashed: vi.fn(),
    selectNotebooks: vi.fn(),
    insertNotebook: vi.fn(),
    patchNotebook: vi.fn(),
    deleteNotebook: vi.fn(),
    selectTags: vi.fn(),
    insertTag: vi.fn(),
    mergeTag: vi.fn(),
    searchNotes: vi.fn(),
  } as unknown as NotesHttp;
}

describe("SupabaseNotesAdapter — notes", () => {
  let http: NotesHttp;
  let adapter: SupabaseNotesAdapter;
  beforeEach(() => {
    http = makeHttp();
    adapter = new SupabaseNotesAdapter(http);
  });

  it("createNote rejects a blank title before hitting the wire", async () => {
    await expect(
      adapter.createNote({
        ownerId: OWNER,
        title: "  ",
        bodyJson: "{}",
      }),
    ).rejects.toThrow(/title/);
    expect(http.insertNote).not.toHaveBeenCalled();
  });

  it("createNote rejects an unparseable bodyJson before hitting the wire", async () => {
    await expect(
      adapter.createNote({
        ownerId: OWNER,
        title: "hi",
        bodyJson: "not json",
      }),
    ).rejects.toThrow(/valid JSON/);
  });

  it("createNote translates the inserted row into a domain Note", async () => {
    vi.mocked(http.insertNote).mockResolvedValue(makeNoteRow({ title: "First" }));
    const note = await adapter.createNote({
      ownerId: OWNER,
      title: "First",
      bodyJson: "{}",
    });
    expect(note.title).toBe("First");
  });

  it("updateNote requires at least one field", async () => {
    await expect(adapter.updateNote(NOTE, {})).rejects.toThrow(/at least one field/);
  });

  it("updateNote rejects a blank title patch", async () => {
    await expect(adapter.updateNote(NOTE, { title: "  " })).rejects.toThrow(/title/);
  });

  it("trashNote and restoreNote toggle the flag", async () => {
    await adapter.trashNote(NOTE);
    expect(http.setNoteTrashed).toHaveBeenCalledWith(NOTE, true);
    await adapter.restoreNote(NOTE);
    expect(http.setNoteTrashed).toHaveBeenCalledWith(NOTE, false);
  });

  it("listNotes paginates and translates rows", async () => {
    vi.mocked(http.selectNotes).mockResolvedValue({
      items: [makeNoteRow(), makeNoteRow({ id: "550e8400-e29b-41d4-a716-446655440099" })],
      total: 2,
    });
    const result = await adapter.listNotes({}, { offset: 0, limit: 50 });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("listNotes rejects an invalid page", async () => {
    await expect(adapter.listNotes({}, { offset: -1, limit: 50 })).rejects.toThrow(/offset/);
    await expect(adapter.listNotes({}, { offset: 0, limit: 0 })).rejects.toThrow(/limit/);
    await expect(adapter.listNotes({}, { offset: 0, limit: 201 })).rejects.toThrow(/limit/);
  });

  it("getNote throws NotesNotFoundError on a 404", async () => {
    vi.mocked(http.selectNote).mockResolvedValue(null);
    await expect(adapter.getNote(NOTE)).rejects.toBeInstanceOf(NotesNotFoundError);
  });

  it("searchKeyword returns an empty array for a blank query without hitting the wire", async () => {
    const hits = await adapter.searchKeyword("   ", {});
    expect(hits).toEqual([]);
    expect(http.searchNotes).not.toHaveBeenCalled();
  });

  it("searchKeyword orders hits by rank descending", async () => {
    const rows: NoteHitRow[] = [
      { ...makeNoteRow({ id: "550e8400-e29b-41d4-a716-446655440010" }), snippet: "lo", rank: 0.1 },
      { ...makeNoteRow({ id: "550e8400-e29b-41d4-a716-446655440020" }), snippet: "hi", rank: 0.9 },
    ];
    vi.mocked(http.searchNotes).mockResolvedValue(rows);
    const hits = await adapter.searchKeyword("hello", {});
    expect(hits.map((h) => h.rank)).toEqual([0.9, 0.1]);
  });
});

describe("SupabaseNotesAdapter — notebooks", () => {
  let http: NotesHttp;
  let adapter: SupabaseNotesAdapter;
  beforeEach(() => {
    http = makeHttp();
    adapter = new SupabaseNotesAdapter(http);
  });

  it("createNotebook rejects a blank name", async () => {
    await expect(adapter.createNotebook({ ownerId: OWNER, name: "" })).rejects.toThrow(/name/);
  });

  it("renameNotebook rejects a blank name and otherwise patches", async () => {
    await expect(adapter.renameNotebook(NOTEBOOK, "")).rejects.toThrow(/name/);
    vi.mocked(http.patchNotebook).mockResolvedValue(makeNotebookRow({ name: "Renamed" }));
    const nb = await adapter.renameNotebook(NOTEBOOK, "Renamed");
    expect(nb.name).toBe("Renamed");
  });

  it("deleteNotebook forwards the move target", async () => {
    await adapter.deleteNotebook(NOTEBOOK, null);
    expect(http.deleteNotebook).toHaveBeenCalledWith(NOTEBOOK, null);
  });

  it("listNotebooks maps every row", async () => {
    vi.mocked(http.selectNotebooks).mockResolvedValue([
      makeNotebookRow(),
      makeNotebookRow({ id: "550e8400-e29b-41d4-a716-446655440099", name: "Archive" }),
    ]);
    const all = await adapter.listNotebooks();
    expect(all.map((n) => n.name)).toEqual(["Inbox", "Archive"]);
  });
});

describe("SupabaseNotesAdapter — tags", () => {
  let http: NotesHttp;
  let adapter: SupabaseNotesAdapter;
  beforeEach(() => {
    http = makeHttp();
    adapter = new SupabaseNotesAdapter(http);
  });

  it("createTag rejects a blank name", async () => {
    await expect(adapter.createTag({ ownerId: OWNER, name: "" })).rejects.toThrow(/name/);
  });

  it("mergeTag rejects merging a tag into itself", async () => {
    await expect(adapter.mergeTag(TAG, TAG)).rejects.toThrow(/itself/);
  });

  it("mergeTag delegates to the wire on distinct tags", async () => {
    await adapter.mergeTag(TAG, TAG_2);
    expect(http.mergeTag).toHaveBeenCalledWith(TAG, TAG_2);
  });

  it("listTags maps every row", async () => {
    vi.mocked(http.selectTags).mockResolvedValue([
      makeTagRow(),
      makeTagRow({ id: "550e8400-e29b-41d4-a716-446655440099", name: "home" }),
    ]);
    const all = await adapter.listTags();
    expect(all.map((t) => t.name)).toEqual(["work", "home"]);
  });
});
