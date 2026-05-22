import { EMBEDDING_DIMENSION } from "./namespace.js";

/**
 * Wire-level port the index-note logic talks to. The Deno entry under
 * supabase/functions/embeddings/index/index.ts wires a real fetch to
 * the user's Ollama Funnel URL with the Host: 127.0.0.1:11434 header
 * override (see ADR 0008) so Ollama's host-check passes.
 *
 * Tests pass a fake.
 */
export interface OllamaEmbedClient {
  /**
   * Embed [inputs] with `model` and return one float vector per
   * input, each of length [EMBEDDING_DIMENSION]. The client is
   * responsible for batching as needed.
   */
  embed(model: string, inputs: readonly string[]): Promise<number[][]>;
}

/**
 * Build a real OllamaEmbedClient against a fetch. Lives in this file
 * so both the Deno entry (cloud) and the backfill script (local
 * Node) can share it.
 *
 * The Funnel URL ends in '/'. When [hostOverride] is set, the client
 * forwards it as the Host header — this is the workaround for the
 * funnel proxy + Ollama's host-check, see ADR 0008.
 */
export function createOllamaEmbedClient(opts: {
  endpoint: string;
  fetcher?: typeof fetch;
  hostOverride?: string;
}): OllamaEmbedClient {
  const fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
  const endpoint = opts.endpoint.endsWith("/") ? opts.endpoint : `${opts.endpoint}/`;
  return {
    async embed(model, inputs) {
      if (inputs.length === 0) return [];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts.hostOverride !== undefined) headers.Host = opts.hostOverride;
      const resp = await fetcher(`${endpoint}api/embed`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input: inputs }),
      });
      if (!resp.ok) {
        throw new Error(`Ollama embed HTTP ${resp.status}`);
      }
      const parsed = (await resp.json()) as { embeddings?: unknown };
      if (!Array.isArray(parsed.embeddings)) {
        throw new Error("Ollama embed: missing 'embeddings' array in response");
      }
      const result: number[][] = [];
      for (let i = 0; i < parsed.embeddings.length; i += 1) {
        const vec = parsed.embeddings[i];
        if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSION) {
          throw new Error(
            `Ollama embed: expected ${EMBEDDING_DIMENSION}-dim vector for input ${i}, got ${
              Array.isArray(vec) ? vec.length : typeof vec
            }`,
          );
        }
        const floats = new Array<number>(vec.length);
        for (let j = 0; j < vec.length; j += 1) {
          const f = vec[j];
          if (typeof f !== "number" || !Number.isFinite(f)) {
            throw new Error("Ollama embed: non-finite scalar in vector");
          }
          floats[j] = f;
        }
        result.push(floats);
      }
      return result;
    },
  };
}
