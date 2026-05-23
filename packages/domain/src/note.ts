import type { NoteId, NotebookId, TagId, UserId } from "./ids.ts";
import type { AttachmentRef } from "./attachment.ts";
import { assertIsoTimestamp } from "./notebook.ts";

export interface Note {
  readonly id: NoteId;
  readonly ownerId: UserId;
  readonly notebookId: NotebookId | null;
  readonly title: string;
  readonly bodyJson: string;
  readonly tags: ReadonlySet<TagId>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isPinned: boolean;
  readonly isTrashed: boolean;
  readonly trashedAt: string | null;
  readonly aiExcluded: boolean;
  readonly attachmentRefs: readonly AttachmentRef[];
}

export function makeNote(input: Note): Note {
  if (input.title.trim().length === 0) {
    throw new Error("Note.title cannot be empty");
  }
  try {
    JSON.parse(input.bodyJson);
  } catch {
    throw new Error("Note.bodyJson must be valid JSON");
  }
  assertIsoTimestamp("Note.createdAt", input.createdAt);
  assertIsoTimestamp("Note.updatedAt", input.updatedAt);
  if (input.isTrashed) {
    if (input.trashedAt === null) {
      throw new Error("Note.trashedAt must be set when isTrashed is true");
    }
    assertIsoTimestamp("Note.trashedAt", input.trashedAt);
  } else if (input.trashedAt !== null) {
    throw new Error("Note.trashedAt must be null when isTrashed is false");
  }
  return input;
}
