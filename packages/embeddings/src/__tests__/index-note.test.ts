import { describe, expect, it, vi } from "vitest";
import { indexNote, type ChunkRow, type IndexNoteDeps, type NoteSnapshot } from "../index-note.js";
import { EMBEDDING_DIMENSION } from "../namespace.js";

const NS = "ollama:nomic-embed-text";
const NOTE_ID = "550e8400-e29b-41d4-a716-446655440001";

function vec768(seed: number): number[] {
  const out = new Array<number>(EMBEDDING_DIMENSION);
  for (let i = 0; i < out.length; i += 1) out[i] = (seed + i) * 0.0001;
  return out;
}

function sampleNote(overrides: Partial<NoteSnapshot> = {}): NoteSnapshot {
  return {
    id: NOTE_ID,
    title: "Welcome",
    bodyJson: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }],
    }),
    isTrashed: false,
    aiExcluded: false,
    ...overrides,
  };
}

type EmbedFn = (model: string, inputs: readonly string[]) => Promise<number[][]>;

function makeDeps(overrides: Partial<IndexNoteDeps> = {}): IndexNoteDeps {
  return {
    fetchNote: vi.fn(async () => sampleNote()),
    embed: {
      embed: vi.fn<EmbedFn>(async (_model, inputs) => inputs.map((_, i) => vec768(i))),
    },
    upsertEmbeddings: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("indexNote", () => {
  it("chunks, embeds, and upserts the rows", async () => {
    const deps = makeDeps();
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.chunks).toBe(1);
    expect(summary.skippedReason).toBeUndefined();
    expect(deps.upsertEmbeddings).toHaveBeenCalledTimes(1);
    const [, , rows] = vi.mocked(deps.upsertEmbeddings).mock.calls[0]!;
    expect(rows).toHaveLength(1);
    expect((rows as ChunkRow[])[0]!.embedding).toHaveLength(EMBEDDING_DIMENSION);
  });

  it("emits as many embeddings as chunks for a long note", async () => {
    const longBody = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: Array.from({ length: 1500 }, (_, i) => `w${i}`).join(" "),
            },
          ],
        },
      ],
    });
    const deps = makeDeps({ fetchNote: async () => sampleNote({ bodyJson: longBody }) });
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.chunks).toBeGreaterThan(1);
    const callArgs = vi.mocked(deps.upsertEmbeddings).mock.calls[0]!;
    expect((callArgs[2] as ChunkRow[]).length).toBe(summary.chunks);
  });

  it("deletes existing embeddings + skips when the note is trashed", async () => {
    const deps = makeDeps({ fetchNote: async () => sampleNote({ isTrashed: true }) });
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.skippedReason).toBe("trashed");
    expect(summary.chunks).toBe(0);
    expect(deps.upsertEmbeddings).toHaveBeenCalledWith(NOTE_ID, NS, []);
    expect(deps.embed.embed).not.toHaveBeenCalled();
  });

  it("deletes existing embeddings + skips when ai_excluded is true", async () => {
    const deps = makeDeps({ fetchNote: async () => sampleNote({ aiExcluded: true }) });
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.skippedReason).toBe("ai_excluded");
    expect(deps.upsertEmbeddings).toHaveBeenCalledWith(NOTE_ID, NS, []);
  });

  it("deletes existing embeddings + skips when the note is missing", async () => {
    const deps = makeDeps({ fetchNote: async () => null });
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.skippedReason).toBe("missing");
    expect(deps.upsertEmbeddings).toHaveBeenCalledWith(NOTE_ID, NS, []);
  });

  it("skips with empty_body when the doc has no text", async () => {
    const empty = JSON.stringify({ type: "doc", content: [] });
    const deps = makeDeps({ fetchNote: async () => sampleNote({ bodyJson: empty, title: "" }) });
    const summary = await indexNote({ noteId: NOTE_ID, namespace: NS }, deps);
    expect(summary.skippedReason).toBe("empty_body");
  });

  it("rejects malformed namespaces", async () => {
    await expect(
      indexNote({ noteId: NOTE_ID, namespace: "not-valid" }, makeDeps()),
    ).rejects.toThrow(/Invalid embedding namespace/);
  });

  it("rejects when the embed model returns the wrong vector count", async () => {
    const deps = makeDeps({
      embed: { embed: async () => [vec768(0), vec768(1), vec768(2)] }, // 3 instead of 1
    });
    await expect(indexNote({ noteId: NOTE_ID, namespace: NS }, deps)).rejects.toThrow(
      /vectors for/,
    );
  });

  it("uses the model from the namespace when calling embed", async () => {
    const embed = vi.fn(async (_m: string, inputs: readonly string[]) =>
      inputs.map((_, i) => vec768(i)),
    );
    const deps = makeDeps({ embed: { embed } });
    await indexNote({ noteId: NOTE_ID, namespace: "ollama:nomic-embed-text" }, deps);
    expect(embed.mock.calls[0]?.[0]).toBe("nomic-embed-text");
  });
});
