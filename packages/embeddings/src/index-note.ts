import { chunkText, plainTextFromProseMirror, type Chunk } from "./chunker.js";
import { assertNamespace, EMBEDDING_DIMENSION } from "./namespace.js";
import type { OllamaEmbedClient } from "./ollama-embed-client.js";

/**
 * Pure-logic backing for the `embeddings/index` Edge Function.
 *
 * Steps:
 *   1. Load the note via [deps.fetchNote].
 *   2. If it doesn't exist, is trashed, ai_excluded, or has an empty
 *      body, delete any existing embeddings for the namespace and
 *      return.
 *   3. Chunk the plaintext body.
 *   4. Call the embed client with all chunks (Ollama batches in one
 *      request for nomic-embed-text).
 *   5. UPSERT the rows via [deps.upsertEmbeddings] (delete-then-insert
 *      per (note_id, namespace) so re-indexing a shrunk note never
 *      leaves stale tail chunks).
 *
 * The function is idempotent — re-running with the same inputs lands
 * on the same end state — so the trigger / pg_cron retry path is safe.
 */

export interface IndexNoteRequest {
  readonly noteId: string;
  readonly namespace: string;
}

export interface NoteSnapshot {
  readonly id: string;
  readonly bodyJson: string;
  readonly title: string;
  readonly isTrashed: boolean;
  readonly aiExcluded: boolean;
}

export interface ChunkRow {
  readonly chunkIndex: number;
  readonly content: string;
  readonly embedding: number[];
}

export interface IndexNoteDeps {
  /** Fetch the note (RLS-scoped via the caller's JWT, or service-role for cron). */
  readonly fetchNote: (noteId: string) => Promise<NoteSnapshot | null>;
  readonly embed: OllamaEmbedClient;
  /**
   * Replace all rows for (note_id, namespace). When `chunks` is empty
   * the rows are deleted. The implementation must be atomic — the
   * Edge Function wraps it in a single PostgREST batch.
   */
  readonly upsertEmbeddings: (
    noteId: string,
    namespace: string,
    chunks: readonly ChunkRow[],
  ) => Promise<void>;
}

export interface IndexNoteSummary {
  readonly noteId: string;
  readonly namespace: string;
  readonly chunks: number;
  readonly skippedReason?: "trashed" | "ai_excluded" | "missing" | "empty_body";
}

export async function indexNote(
  request: IndexNoteRequest,
  deps: IndexNoteDeps,
): Promise<IndexNoteSummary> {
  assertNamespace(request.namespace);
  const note = await deps.fetchNote(request.noteId);
  if (note === null) {
    await deps.upsertEmbeddings(request.noteId, request.namespace, []);
    return {
      noteId: request.noteId,
      namespace: request.namespace,
      chunks: 0,
      skippedReason: "missing",
    };
  }
  if (note.isTrashed) {
    await deps.upsertEmbeddings(request.noteId, request.namespace, []);
    return {
      noteId: request.noteId,
      namespace: request.namespace,
      chunks: 0,
      skippedReason: "trashed",
    };
  }
  if (note.aiExcluded) {
    await deps.upsertEmbeddings(request.noteId, request.namespace, []);
    return {
      noteId: request.noteId,
      namespace: request.namespace,
      chunks: 0,
      skippedReason: "ai_excluded",
    };
  }

  const plain = composeText(note);
  if (plain.length === 0) {
    await deps.upsertEmbeddings(request.noteId, request.namespace, []);
    return {
      noteId: request.noteId,
      namespace: request.namespace,
      chunks: 0,
      skippedReason: "empty_body",
    };
  }

  const chunks = chunkText(plain);
  const model = modelFromNamespace(request.namespace);
  const vectors = await deps.embed.embed(
    model,
    chunks.map((c) => c.text),
  );
  if (vectors.length !== chunks.length) {
    throw new Error(
      `embeddings/index: model returned ${vectors.length} vectors for ${chunks.length} chunks`,
    );
  }
  for (let i = 0; i < vectors.length; i += 1) {
    const v = vectors[i];
    if (!v || v.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `embeddings/index: vector ${i} has wrong dimension (${v?.length ?? 0} != ${EMBEDDING_DIMENSION})`,
      );
    }
  }
  const rows: ChunkRow[] = chunks.map((c: Chunk, i) => ({
    chunkIndex: c.index,
    content: c.text,
    embedding: vectors[i]!,
  }));
  await deps.upsertEmbeddings(request.noteId, request.namespace, rows);
  return {
    noteId: request.noteId,
    namespace: request.namespace,
    chunks: rows.length,
  };
}

function composeText(note: NoteSnapshot): string {
  const body = plainTextFromProseMirror(note.bodyJson);
  const title = note.title.trim();
  if (title.length === 0) return body;
  if (body.length === 0) return title;
  return `${title}\n\n${body}`;
}

function modelFromNamespace(namespace: string): string {
  const idx = namespace.indexOf(":");
  if (idx <= 0 || idx === namespace.length - 1) {
    throw new Error(`Invalid namespace ${JSON.stringify(namespace)}`);
  }
  return namespace.slice(idx + 1);
}
