import {
  AttachmentId,
  NoteId,
  NotebookId,
  TagId,
  UserId,
  makeNote,
  makeNotebook,
  makeTag,
  makeAttachmentRef,
  type AttachmentRef,
  type Note,
  type Notebook,
  type StorageProviderId,
  type Tag,
} from "@notes-app/domain";

/**
 * PostgREST row shapes. Hand-written for V1; once a real Supabase project
 * exists we replace this file with the output of `supabase gen types
 * typescript`. ADR 0004 captures the rationale and rollout plan.
 */

export interface NotebookRow {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly color: string;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TagRow {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface NoteRow {
  readonly id: string;
  readonly owner_id: string;
  readonly notebook_id: string | null;
  readonly title: string;
  readonly body_json: unknown;
  readonly is_pinned: boolean;
  readonly is_trashed: boolean;
  readonly trashed_at: string | null;
  readonly ai_excluded: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  /** Filled in by the select shape `notes?select=*,note_tags(tag_id)`. */
  readonly note_tags?: ReadonlyArray<{ readonly tag_id: string }>;
  /** Filled in by the search RPC. */
  readonly attachments_refs?: readonly AttachmentRefRow[];
}

export interface AttachmentRefRow {
  readonly id: string;
  readonly owner_id: string;
  readonly note_id: string;
  readonly provider: StorageProviderId;
  readonly external_id: string;
  readonly display_name: string;
  readonly mime: string;
  readonly size_bytes: number;
  readonly thumbnail_id: string | null;
}

export interface NoteHitRow extends NoteRow {
  readonly snippet: string;
  readonly rank: number;
}

export function rowToNotebook(row: NotebookRow): Notebook {
  return makeNotebook({
    id: NotebookId(row.id),
    ownerId: UserId(row.owner_id),
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function rowToTag(row: TagRow): Tag {
  return makeTag({
    id: TagId(row.id),
    ownerId: UserId(row.owner_id),
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function rowToAttachmentRef(row: AttachmentRefRow): AttachmentRef {
  const base: AttachmentRef = {
    id: AttachmentId(row.id),
    ownerId: UserId(row.owner_id),
    noteId: NoteId(row.note_id),
    provider: row.provider,
    externalFileId: row.external_id,
    mimeType: row.mime,
    sizeBytes: row.size_bytes,
    displayName: row.display_name,
    ...(row.thumbnail_id !== null ? { thumbnailId: row.thumbnail_id } : {}),
  };
  return makeAttachmentRef(base);
}

export function rowToNote(row: NoteRow): Note {
  const bodyJson =
    typeof row.body_json === "string" ? row.body_json : JSON.stringify(row.body_json);
  const tagIds = (row.note_tags ?? []).map((entry) => TagId(entry.tag_id));
  return makeNote({
    id: NoteId(row.id),
    ownerId: UserId(row.owner_id),
    notebookId: row.notebook_id !== null ? NotebookId(row.notebook_id) : null,
    title: row.title,
    bodyJson,
    tags: new Set(tagIds),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPinned: row.is_pinned,
    isTrashed: row.is_trashed,
    trashedAt: row.trashed_at,
    aiExcluded: row.ai_excluded,
    attachmentRefs: (row.attachments_refs ?? []).map(rowToAttachmentRef),
  });
}
