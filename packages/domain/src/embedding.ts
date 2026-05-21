import type { EmbeddingChunkId, NoteId, UserId } from "./ids.js";

export interface EmbeddingChunk {
  readonly id: EmbeddingChunkId;
  readonly ownerId: UserId;
  readonly noteId: NoteId;
  readonly chunkIndex: number;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly namespace: string;
}

export function makeEmbeddingChunk(input: EmbeddingChunk): EmbeddingChunk {
  if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) {
    throw new Error("EmbeddingChunk.chunkIndex must be a non-negative integer");
  }
  if (input.content.length === 0) {
    throw new Error("EmbeddingChunk.content cannot be empty");
  }
  if (input.embedding.length === 0) {
    throw new Error("EmbeddingChunk.embedding cannot be empty");
  }
  for (const v of input.embedding) {
    if (!Number.isFinite(v)) {
      throw new Error("EmbeddingChunk.embedding entries must all be finite numbers");
    }
  }
  if (input.namespace.trim().length === 0) {
    throw new Error("EmbeddingChunk.namespace cannot be empty");
  }
  return input;
}
