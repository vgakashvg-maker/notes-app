import { describe, expect, it } from "vitest";
import {
  rowToAttachmentRef,
  rowToNote,
  rowToNotebook,
  rowToTag,
  type NoteRow,
  type NotebookRow,
  type TagRow,
  type AttachmentRefRow,
} from "../rows.js";

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const NOTE = "550e8400-e29b-41d4-a716-446655440001";
const NOTEBOOK = "550e8400-e29b-41d4-a716-446655440002";
const TAG = "550e8400-e29b-41d4-a716-446655440003";
const ATTACHMENT = "550e8400-e29b-41d4-a716-446655440010";

describe("rowToNotebook", () => {
  it("translates a PostgREST row into a domain Notebook", () => {
    const row: NotebookRow = {
      id: NOTEBOOK,
      owner_id: OWNER,
      name: "Inbox",
      color: "#aabbcc",
      sort_order: 0,
      created_at: "2026-05-20T12:00:00.000Z",
      updated_at: "2026-05-20T12:00:00.000Z",
    };
    const nb = rowToNotebook(row);
    expect(nb.id).toBe(NOTEBOOK);
    expect(nb.name).toBe("Inbox");
    expect(nb.color).toBe("#aabbcc");
  });
});

describe("rowToTag", () => {
  it("translates a tag row", () => {
    const row: TagRow = {
      id: TAG,
      owner_id: OWNER,
      name: "work",
      color: "#112233",
      created_at: "2026-05-20T12:00:00.000Z",
      updated_at: "2026-05-20T12:00:00.000Z",
    };
    expect(rowToTag(row).name).toBe("work");
  });
});

describe("rowToAttachmentRef", () => {
  it("translates with thumbnail_id when present", () => {
    const row: AttachmentRefRow = {
      id: ATTACHMENT,
      owner_id: OWNER,
      note_id: NOTE,
      provider: "GOOGLE_DRIVE",
      external_id: "drive-file-abc",
      display_name: "spec.pdf",
      mime: "application/pdf",
      size_bytes: 1024,
      thumbnail_id: "thumb-1",
    };
    const ref = rowToAttachmentRef(row);
    expect(ref.thumbnailId).toBe("thumb-1");
  });

  it("omits thumbnailId when null in the row", () => {
    const row: AttachmentRefRow = {
      id: ATTACHMENT,
      owner_id: OWNER,
      note_id: NOTE,
      provider: "GOOGLE_DRIVE",
      external_id: "drive-file-abc",
      display_name: "spec.pdf",
      mime: "application/pdf",
      size_bytes: 1024,
      thumbnail_id: null,
    };
    expect(rowToAttachmentRef(row).thumbnailId).toBeUndefined();
  });
});

describe("rowToNote", () => {
  const base: NoteRow = {
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
  };

  it("serialises an object body_json back to a string", () => {
    const note = rowToNote(base);
    expect(typeof note.bodyJson).toBe("string");
    expect(JSON.parse(note.bodyJson)).toEqual({ type: "doc", content: [] });
  });

  it("passes through a string body_json without re-serialising", () => {
    const note = rowToNote({ ...base, body_json: '{"type":"doc"}' });
    expect(note.bodyJson).toBe('{"type":"doc"}');
  });

  it("collects tag ids from the embedded note_tags array", () => {
    const note = rowToNote({ ...base, note_tags: [{ tag_id: TAG }] });
    expect(note.tags.has(TAG as never)).toBe(true);
  });

  it("preserves notebook_id null", () => {
    const note = rowToNote({ ...base, notebook_id: null });
    expect(note.notebookId).toBeNull();
  });

  it("hydrates attachments from the embedded array", () => {
    const note = rowToNote({
      ...base,
      attachments_refs: [
        {
          id: ATTACHMENT,
          owner_id: OWNER,
          note_id: NOTE,
          provider: "GOOGLE_DRIVE",
          external_id: "x",
          display_name: "spec.pdf",
          mime: "application/pdf",
          size_bytes: 1,
          thumbnail_id: null,
        },
      ],
    });
    expect(note.attachmentRefs).toHaveLength(1);
  });
});
