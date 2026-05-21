import { describe, expect, it } from "vitest";
import { makeEmbeddingChunk, type EmbeddingChunk } from "../embedding.js";
import { EmbeddingChunkId, NoteId, UserId } from "../ids.js";

const OWNER = UserId("550e8400-e29b-41d4-a716-446655440000");
const NOTE = NoteId("550e8400-e29b-41d4-a716-446655440001");
const CHUNK = EmbeddingChunkId("550e8400-e29b-41d4-a716-446655440020");

function base(overrides: Partial<EmbeddingChunk> = {}): EmbeddingChunk {
  return {
    id: CHUNK,
    ownerId: OWNER,
    noteId: NOTE,
    chunkIndex: 0,
    content: "hello world",
    embedding: [0.1, 0.2, 0.3],
    namespace: "default",
    ...overrides,
  };
}

describe("makeEmbeddingChunk", () => {
  it("accepts a valid chunk", () => {
    expect(makeEmbeddingChunk(base()).content).toBe("hello world");
  });

  it("rejects a negative chunkIndex", () => {
    expect(() => makeEmbeddingChunk(base({ chunkIndex: -1 }))).toThrow(/chunkIndex/);
  });

  it("rejects an empty embedding", () => {
    expect(() => makeEmbeddingChunk(base({ embedding: [] }))).toThrow(/embedding/);
  });

  it("rejects non-finite embedding values", () => {
    expect(() => makeEmbeddingChunk(base({ embedding: [0.1, Number.NaN] }))).toThrow(/finite/);
  });

  it("rejects a blank namespace", () => {
    expect(() => makeEmbeddingChunk(base({ namespace: "  " }))).toThrow(/namespace/);
  });
});
