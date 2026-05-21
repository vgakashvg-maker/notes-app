// Opaque branded ID types. The `__brand` field exists only at the type level
// (TS erases it at runtime). A `UserId` and a `NoteId` are both strings at
// runtime but the compiler will reject passing one where the other is
// expected — this is what catches the "I swapped two UUIDs" class of bug.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function brand<TBrand extends string>(label: TBrand, raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
  if (!UUID_RE.test(raw)) {
    throw new Error(`${label} must be a UUID, got ${JSON.stringify(raw)}`);
  }
  return raw;
}

export type UserId = string & { readonly __brand: "UserId" };
export type NotebookId = string & { readonly __brand: "NotebookId" };
export type TagId = string & { readonly __brand: "TagId" };
export type NoteId = string & { readonly __brand: "NoteId" };
export type AttachmentId = string & { readonly __brand: "AttachmentId" };
export type EmbeddingChunkId = string & { readonly __brand: "EmbeddingChunkId" };
export type ConversationId = string & { readonly __brand: "ConversationId" };

export const UserId = (raw: string): UserId => brand("UserId", raw) as UserId;
export const NotebookId = (raw: string): NotebookId => brand("NotebookId", raw) as NotebookId;
export const TagId = (raw: string): TagId => brand("TagId", raw) as TagId;
export const NoteId = (raw: string): NoteId => brand("NoteId", raw) as NoteId;
export const AttachmentId = (raw: string): AttachmentId =>
  brand("AttachmentId", raw) as AttachmentId;
export const EmbeddingChunkId = (raw: string): EmbeddingChunkId =>
  brand("EmbeddingChunkId", raw) as EmbeddingChunkId;
export const ConversationId = (raw: string): ConversationId =>
  brand("ConversationId", raw) as ConversationId;
