import { DEFAULT_NAMESPACE, EMBEDDING_DIMENSION } from "./namespace.ts";

/**
 * Wrapper around the SQL `vector_search()` function. Client code passes
 * a query string + filters; the wrapper embeds the query (via the
 * caller-supplied [OllamaEmbedClient]) and forwards the call to
 * PostgREST.
 *
 * The wrapper does NOT cache anything — re-running the same query
 * costs one embed call. M09 (AI services) will memoise chat-side
 * queries when it lands.
 */

import type { OllamaEmbedClient } from "./ollama-embed-client.ts";

export interface VectorSearchFilters {
  readonly notebookIds?: readonly string[];
  readonly tagIds?: readonly string[];
  readonly excludeAi?: boolean;
}

export interface VectorHit {
  readonly noteId: string;
  readonly chunkIndex: number;
  readonly content: string;
  /** Cosine distance — smaller is closer. */
  readonly distance: number;
}

export interface VectorSearchDeps {
  readonly embed: OllamaEmbedClient;
  /**
   * Invoke the SQL function. The Edge Function / web shell wires this
   * to a PostgREST RPC call against the user's JWT (RLS applies);
   * tests pass a fake.
   */
  readonly callRpc: (params: {
    readonly queryEmbedding: number[];
    readonly k: number;
    readonly namespace: string;
    readonly filterNotebooks: readonly string[] | null;
    readonly filterTags: readonly string[] | null;
    readonly excludeAi: boolean;
  }) => Promise<readonly VectorHit[]>;
}

export interface VectorSearchOptions {
  readonly k?: number;
  readonly namespace?: string;
  readonly filters?: VectorSearchFilters;
}

const DEFAULT_K = 8;

export async function vectorSearch(
  query: string,
  opts: VectorSearchOptions,
  deps: VectorSearchDeps,
): Promise<readonly VectorHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const k = opts.k ?? DEFAULT_K;
  if (!Number.isInteger(k) || k <= 0 || k > 100) {
    throw new Error("vectorSearch: k must be an integer in (0, 100]");
  }
  const namespace = opts.namespace ?? DEFAULT_NAMESPACE;
  const model = modelFromNamespace(namespace);
  const vectors = await deps.embed.embed(model, [trimmed]);
  const queryEmbedding = vectors[0];
  if (queryEmbedding === undefined || queryEmbedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `vectorSearch: model returned ${queryEmbedding?.length ?? 0} dims, expected ${EMBEDDING_DIMENSION}`,
    );
  }
  return deps.callRpc({
    queryEmbedding,
    k,
    namespace,
    filterNotebooks: opts.filters?.notebookIds ?? null,
    filterTags: opts.filters?.tagIds ?? null,
    excludeAi: opts.filters?.excludeAi ?? true,
  });
}

function modelFromNamespace(namespace: string): string {
  const idx = namespace.indexOf(":");
  if (idx <= 0 || idx === namespace.length - 1) {
    throw new Error(`Invalid namespace ${JSON.stringify(namespace)}`);
  }
  return namespace.slice(idx + 1);
}
