import type {
  AIChunk,
  AIOptions,
  AIProvider,
  AIResponse,
  Capability,
  Message,
  ModelDescriptor,
  ProviderHealth,
} from "@notes-app/domain";

/**
 * Structural slice of Ollama's REST surface the adapter uses. The Deno
 * Edge Function binding wires a real `fetch`; tests pass a fake. This
 * keeps `@supabase/supabase-js`-style provider deps out of the package.
 *
 * `chat` returns the full response stream as a single body — the
 * adapter parses NDJSON itself (Ollama emits one JSON object per
 * newline). `chatNdjson` returns an AsyncIterable of raw JSON objects
 * the adapter can drive with backpressure.
 */
export interface OllamaApiClient {
  /** POST /api/chat (stream=false). */
  chat(req: OllamaChatRequest): Promise<OllamaChatResponse>;
  /** POST /api/chat (stream=true) — NDJSON stream. */
  chatStream(req: OllamaChatRequest): AsyncIterable<OllamaChatChunk>;
  /** POST /api/embed. */
  embed(model: string, inputs: readonly string[]): Promise<number[][]>;
  /** GET /api/tags. */
  listModels(): Promise<readonly OllamaModelInfo[]>;
  /** A trivial reachability check. */
  ping(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly options?: {
    readonly temperature?: number;
    readonly num_predict?: number;
    readonly stop?: readonly string[];
  };
}

export interface OllamaChatResponse {
  readonly message: { readonly role: string; readonly content: string };
  readonly model: string;
  readonly done: boolean;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
  readonly total_duration?: number;
}

export interface OllamaChatChunk {
  readonly message?: { readonly role: string; readonly content: string };
  readonly model?: string;
  readonly done: boolean;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

export interface OllamaModelInfo {
  readonly name: string;
  readonly size?: number;
}

export interface OllamaAdapterOptions {
  readonly client: OllamaApiClient;
  /**
   * Override for testing; defaults to a one-shot retry on transport
   * errors with a 1s backoff (per the spec).
   */
  readonly retry?: <T>(op: () => Promise<T>) => Promise<T>;
}

export class OllamaProviderAdapter implements AIProvider {
  readonly id = "OLLAMA" as const;
  readonly capabilities: ReadonlySet<Capability> = new Set(["STREAMING", "EMBEDDINGS"]);
  private readonly retry: <T>(op: () => Promise<T>) => Promise<T>;

  constructor(private readonly options: OllamaAdapterOptions) {
    this.retry = options.retry ?? defaultRetry;
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    const raw = await this.retry(() => this.options.client.listModels());
    return raw.map((m) => ({
      id: m.name,
      // Ollama doesn't expose context window over the tags API for V1;
      // we treat all listings as "unknown" and let the router carry
      // the contextTokens hint.
      contextTokens: 0,
      supports: this.capabilities,
    }));
  }

  async chat(messages: readonly Message[], opts: AIOptions): Promise<AIResponse> {
    const start = Date.now();
    const resp = await this.retry(() =>
      this.options.client.chat({
        model: opts.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        options: buildOllamaOptions(opts),
      }),
    );
    return {
      content: resp.message.content,
      model: resp.model,
      promptTokens: resp.prompt_eval_count ?? 0,
      completionTokens: resp.eval_count ?? 0,
      latencyMs: Date.now() - start,
    };
  }

  streamChat(messages: readonly Message[], opts: AIOptions): AsyncIterable<AIChunk> {
    const client = this.options.client;
    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<AIChunk> {
        const stream = client.chatStream({
          model: opts.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          options: buildOllamaOptions(opts),
        });
        let finalChunk: AIChunk | null = null;
        for await (const raw of stream) {
          const delta = raw.message?.content ?? "";
          if (raw.done) {
            finalChunk = {
              delta,
              done: true,
              ...(raw.model !== undefined ? { model: raw.model } : {}),
              ...(raw.prompt_eval_count !== undefined
                ? { promptTokens: raw.prompt_eval_count }
                : {}),
              ...(raw.eval_count !== undefined ? { completionTokens: raw.eval_count } : {}),
            };
          } else if (delta.length > 0) {
            yield { delta, done: false };
          }
        }
        if (finalChunk !== null) yield finalChunk;
      },
    };
  }

  async embed(texts: readonly string[], model: string): Promise<readonly number[][]> {
    if (texts.length === 0) return [];
    return this.retry(() => this.options.client.embed(model, texts));
  }

  async ping(): Promise<ProviderHealth> {
    const { ok, latencyMs, message } = await this.options.client.ping();
    return { ok, latencyMs, ...(message !== undefined ? { message } : {}) };
  }
}

function buildOllamaOptions(opts: AIOptions): {
  temperature?: number;
  num_predict?: number;
  stop?: readonly string[];
} {
  const out: { temperature?: number; num_predict?: number; stop?: readonly string[] } = {};
  if (opts.temperature !== undefined) out.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) out.num_predict = opts.maxTokens;
  if (opts.stop !== undefined && opts.stop.length > 0) out.stop = opts.stop;
  return out;
}

async function defaultRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isTransient(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return op();
  }
}

function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("timeout") || msg.includes("ecconreset"))
      return true;
    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 500) return true;
  }
  return false;
}

/**
 * Build a real OllamaApiClient against `fetch`. Lives here so both the
 * Edge Function and the local-script paths share it. Honours the
 * `Host: 127.0.0.1:11434` override the M10 embeddings client uses for
 * the same Funnel + host-check workaround.
 */
export function createOllamaApiClient(opts: {
  endpoint: string;
  fetcher?: typeof fetch;
  hostOverride?: string;
}): OllamaApiClient {
  const fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
  const endpoint = opts.endpoint.endsWith("/") ? opts.endpoint : `${opts.endpoint}/`;
  const baseHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.hostOverride !== undefined) h.Host = opts.hostOverride;
    return h;
  };
  return {
    async chat(req) {
      const resp = await fetcher(`${endpoint}api/chat`, {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ ...req, stream: false }),
      });
      if (!resp.ok) {
        const err = Object.assign(new Error(`Ollama chat HTTP ${resp.status}`), {
          status: resp.status,
        });
        throw err;
      }
      return (await resp.json()) as OllamaChatResponse;
    },
    chatStream(req) {
      const url = `${endpoint}api/chat`;
      const headers = baseHeaders();
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<OllamaChatChunk> {
          const resp = await fetcher(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...req, stream: true }),
          });
          if (!resp.ok || resp.body === null) {
            const err = Object.assign(new Error(`Ollama chat stream HTTP ${resp.status}`), {
              status: resp.status,
            });
            throw err;
          }
          const reader = resp.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf("\n");
            while (newline !== -1) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              if (line.length > 0) {
                yield JSON.parse(line) as OllamaChatChunk;
              }
              newline = buffer.indexOf("\n");
            }
          }
          if (buffer.trim().length > 0) {
            yield JSON.parse(buffer.trim()) as OllamaChatChunk;
          }
        },
      };
    },
    async embed(model, inputs) {
      const resp = await fetcher(`${endpoint}api/embed`, {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ model, input: inputs }),
      });
      if (!resp.ok) throw new Error(`Ollama embed HTTP ${resp.status}`);
      const parsed = (await resp.json()) as { embeddings?: number[][] };
      if (!Array.isArray(parsed.embeddings)) {
        throw new Error("Ollama embed: missing embeddings");
      }
      return parsed.embeddings;
    },
    async listModels() {
      const resp = await fetcher(`${endpoint}api/tags`, { headers: baseHeaders() });
      if (!resp.ok) throw new Error(`Ollama list models HTTP ${resp.status}`);
      const parsed = (await resp.json()) as { models?: OllamaModelInfo[] };
      return parsed.models ?? [];
    },
    async ping() {
      const start = Date.now();
      try {
        const resp = await fetcher(`${endpoint}api/tags`, { headers: baseHeaders() });
        return { ok: resp.ok, latencyMs: Date.now() - start };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
