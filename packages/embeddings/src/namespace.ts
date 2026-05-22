/**
 * Embedding namespaces are `${provider}:${model}`. The default V1
 * namespace is Ollama's `nomic-embed-text` model, 768-dim, cosine
 * distance. Future namespaces are introduced by M15 (AI settings)
 * and validated by the same `EMBEDDING_DIMENSION` constant — bumping
 * to a 1024-dim model also requires a migration that adds a new
 * partial HNSW index for the namespace.
 */
export const DEFAULT_NAMESPACE = "ollama:nomic-embed-text";
export const EMBEDDING_DIMENSION = 768;

const NAMESPACE_RE = /^[a-z0-9_-]+:[a-z0-9._-]+$/i;

export function isValidNamespace(value: string): boolean {
  return NAMESPACE_RE.test(value);
}

export function assertNamespace(value: string): asserts value is string {
  if (!isValidNamespace(value)) {
    throw new Error(
      `Invalid embedding namespace ${JSON.stringify(value)} — expected provider:model`,
    );
  }
}
