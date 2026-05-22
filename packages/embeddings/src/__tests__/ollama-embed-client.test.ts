import { describe, expect, it, vi } from "vitest";
import { createOllamaEmbedClient } from "../ollama-embed-client.js";
import { EMBEDDING_DIMENSION } from "../namespace.js";

function vec768(seed: number): number[] {
  const out = new Array<number>(EMBEDDING_DIMENSION);
  for (let i = 0; i < out.length; i += 1) out[i] = (seed + i) * 0.0001;
  return out;
}

describe("createOllamaEmbedClient", () => {
  it("POSTs to {endpoint}/api/embed with model + input and returns parsed vectors", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ embeddings: [vec768(1), vec768(2)] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createOllamaEmbedClient({
      endpoint: "https://kepler.tail97a482.ts.net",
      fetcher,
      hostOverride: "127.0.0.1:11434",
    });
    const result = await client.embed("nomic-embed-text", ["hello", "world"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(EMBEDDING_DIMENSION);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://kepler.tail97a482.ts.net/api/embed");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    const headers = reqInit.headers as Record<string, string>;
    expect(headers["Host"]).toBe("127.0.0.1:11434");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(reqInit.body))).toEqual({
      model: "nomic-embed-text",
      input: ["hello", "world"],
    });
  });

  it("returns [] for empty input without hitting the wire", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createOllamaEmbedClient({ endpoint: "http://x/", fetcher });
    expect(await client.embed("m", [])).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("throws on HTTP errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const client = createOllamaEmbedClient({ endpoint: "http://x/", fetcher });
    await expect(client.embed("m", ["hi"])).rejects.toThrow(/HTTP 500/);
  });

  it("rejects vectors with the wrong dimension", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 }),
    );
    const client = createOllamaEmbedClient({ endpoint: "http://x/", fetcher });
    await expect(client.embed("m", ["hi"])).rejects.toThrow(/dim vector/);
  });

  it("rejects non-finite scalars", async () => {
    const v = vec768(0);
    v[0] = Number.NaN;
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ embeddings: [v] }), { status: 200 }),
    );
    const client = createOllamaEmbedClient({ endpoint: "http://x/", fetcher });
    await expect(client.embed("m", ["hi"])).rejects.toThrow(/non-finite/);
  });

  it("appends a trailing slash to a bare endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ embeddings: [vec768(1)] }), { status: 200 }),
    );
    const client = createOllamaEmbedClient({ endpoint: "http://x", fetcher });
    await client.embed("m", ["hi"]);
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://x/api/embed");
  });
});
