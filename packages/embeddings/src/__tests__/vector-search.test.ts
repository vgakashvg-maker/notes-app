import { describe, expect, it, vi } from "vitest";
import { vectorSearch, type VectorHit, type VectorSearchDeps } from "../vector-search.js";
import { DEFAULT_NAMESPACE, EMBEDDING_DIMENSION } from "../namespace.js";

function vec768(seed: number): number[] {
  const out = new Array<number>(EMBEDDING_DIMENSION);
  for (let i = 0; i < out.length; i += 1) out[i] = (seed + i) * 0.0001;
  return out;
}

function makeDeps(): VectorSearchDeps & {
  callRpc: ReturnType<typeof vi.fn>;
  embed: { embed: ReturnType<typeof vi.fn> };
} {
  return {
    embed: { embed: vi.fn(async () => [vec768(1)]) },
    callRpc: vi.fn(
      async (): Promise<readonly VectorHit[]> => [
        { noteId: "n1", chunkIndex: 0, content: "hello world", distance: 0.12 },
      ],
    ),
  };
}

describe("vectorSearch", () => {
  it("returns [] for blank queries without hitting the wire", async () => {
    const deps = makeDeps();
    const hits = await vectorSearch("   ", {}, deps);
    expect(hits).toEqual([]);
    expect(deps.embed.embed).not.toHaveBeenCalled();
    expect(deps.callRpc).not.toHaveBeenCalled();
  });

  it("embeds the query then forwards filters to callRpc", async () => {
    const deps = makeDeps();
    const hits = await vectorSearch(
      "tax forms",
      {
        k: 5,
        filters: { notebookIds: ["nb1"], tagIds: ["t1"], excludeAi: false },
      },
      deps,
    );
    expect(hits).toHaveLength(1);
    expect(deps.embed.embed).toHaveBeenCalledWith("nomic-embed-text", ["tax forms"]);
    expect(deps.callRpc).toHaveBeenCalledTimes(1);
    const rpcCall = deps.callRpc.mock.calls[0]?.[0];
    expect(rpcCall?.k).toBe(5);
    expect(rpcCall?.namespace).toBe(DEFAULT_NAMESPACE);
    expect(rpcCall?.filterNotebooks).toEqual(["nb1"]);
    expect(rpcCall?.filterTags).toEqual(["t1"]);
    expect(rpcCall?.excludeAi).toBe(false);
  });

  it("defaults k to 8 and excludeAi to true", async () => {
    const deps = makeDeps();
    await vectorSearch("hello", {}, deps);
    const rpcCall = deps.callRpc.mock.calls[0]?.[0];
    expect(rpcCall?.k).toBe(8);
    expect(rpcCall?.excludeAi).toBe(true);
    expect(rpcCall?.filterNotebooks).toBeNull();
    expect(rpcCall?.filterTags).toBeNull();
  });

  it("rejects nonsense k", async () => {
    await expect(vectorSearch("hi", { k: 0 }, makeDeps())).rejects.toThrow(/k must be/);
    await expect(vectorSearch("hi", { k: 200 }, makeDeps())).rejects.toThrow(/k must be/);
  });

  it("rejects when the embed model returns the wrong dimension", async () => {
    const deps = makeDeps();
    deps.embed.embed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    await expect(vectorSearch("hi", {}, deps)).rejects.toThrow(/dims/);
  });
});
