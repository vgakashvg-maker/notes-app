import { describe, expect, it, vi } from "vitest";
import { OllamaProviderAdapter, type OllamaApiClient } from "../ollama-adapter.js";

function makeClient(overrides: Partial<OllamaApiClient> = {}): OllamaApiClient {
  return {
    chat: vi.fn(async () => ({
      message: { role: "assistant", content: "Hello!" },
      model: "qwen2.5:7b",
      done: true,
      prompt_eval_count: 10,
      eval_count: 2,
    })),
    chatStream: vi.fn(),
    embed: vi.fn(async () => [[0.1, 0.2, 0.3]]),
    listModels: vi.fn(async () => [{ name: "qwen2.5:7b" }]),
    ping: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
    ...overrides,
  };
}

describe("OllamaProviderAdapter.chat", () => {
  it("returns content + tokens + latency", async () => {
    const adapter = new OllamaProviderAdapter({ client: makeClient() });
    const result = await adapter.chat([{ role: "user", content: "Hi" }], { model: "qwen2.5:7b" });
    expect(result.content).toBe("Hello!");
    expect(result.promptTokens).toBe(10);
    expect(result.completionTokens).toBe(2);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("retries once on transient failure then succeeds", async () => {
    let attempts = 0;
    const client = makeClient({
      chat: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("network unreachable");
          throw err;
        }
        return {
          message: { role: "assistant", content: "After retry" },
          model: "m",
          done: true,
        };
      }),
    });
    const adapter = new OllamaProviderAdapter({
      client,
      retry: async (op) => {
        try {
          return await op();
        } catch (_err) {
          void _err;
          return op();
        }
      },
    });
    const result = await adapter.chat([{ role: "user", content: "hi" }], {
      model: "m",
    });
    expect(result.content).toBe("After retry");
    expect(attempts).toBe(2);
  });

  it("does not retry on a 4xx error", async () => {
    let attempts = 0;
    const err = Object.assign(new Error("bad request"), { status: 400 });
    const client = makeClient({
      chat: vi.fn(async () => {
        attempts += 1;
        throw err;
      }),
    });
    const adapter = new OllamaProviderAdapter({ client });
    await expect(adapter.chat([{ role: "user", content: "hi" }], { model: "m" })).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});

describe("OllamaProviderAdapter.streamChat", () => {
  it("yields each delta then a final done chunk with metrics", async () => {
    const client = makeClient({
      chatStream(_req) {
        return {
          async *[Symbol.asyncIterator]() {
            yield { message: { role: "assistant", content: "Hello " }, done: false };
            yield { message: { role: "assistant", content: "world." }, done: false };
            yield {
              done: true,
              model: "qwen2.5:7b",
              prompt_eval_count: 5,
              eval_count: 3,
            };
          },
        };
      },
    });
    const adapter = new OllamaProviderAdapter({ client });
    const chunks: { delta: string; done: boolean }[] = [];
    for await (const chunk of adapter.streamChat([{ role: "user", content: "Hi" }], {
      model: "qwen2.5:7b",
    })) {
      chunks.push({ delta: chunk.delta, done: chunk.done });
      if (chunk.done) {
        expect(chunk.promptTokens).toBe(5);
        expect(chunk.completionTokens).toBe(3);
      }
    }
    expect(chunks.map((c) => c.delta)).toEqual(["Hello ", "world.", ""]);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });
});

describe("OllamaProviderAdapter.embed + listModels + ping", () => {
  it("returns [] for empty embed input without hitting the wire", async () => {
    const client = makeClient();
    const adapter = new OllamaProviderAdapter({ client });
    expect(await adapter.embed([], "m")).toEqual([]);
    expect(client.embed).not.toHaveBeenCalled();
  });

  it("listModels maps OllamaModelInfo into ModelDescriptor", async () => {
    const client = makeClient();
    const adapter = new OllamaProviderAdapter({ client });
    const models = await adapter.listModels();
    expect(models.map((m) => m.id)).toEqual(["qwen2.5:7b"]);
    expect(models[0]?.supports.has("STREAMING")).toBe(true);
  });

  it("ping passes through latency + ok", async () => {
    const adapter = new OllamaProviderAdapter({ client: makeClient() });
    const h = await adapter.ping();
    expect(h.ok).toBe(true);
    expect(h.latencyMs).toBe(12);
  });
});
