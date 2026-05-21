# M10 — Embedding & Vector Search Module

> **Module ID**: `M10`
> **Complexity / Recommended AI dev**: Sonnet
> **Estimated duration**: 3–4 days
> **Depends on**: M01, M04

---

## Purpose

Manage embeddings for every note. Re-embed on update. Provide top-k retrieval for RAG. V1 uses pgvector inside Supabase Postgres; the VectorStore port supports swap to Pinecone or Qdrant later without retrieval-code changes. Embeddings are namespaced by model so multiple embedding models can coexist during migration.

---

## Public Interface (the port)

```kotlin
interface VectorStore {
  suspend fun upsert(noteId: NoteId, chunks: List<EmbeddingChunk>, namespace: String)
  suspend fun delete(noteId: NoteId, namespace: String? = null)
  suspend fun search(queryEmbedding: FloatArray, k: Int, filter: VectorFilter, namespace: String): List<VectorHit>
}

data class EmbeddingChunk(val text: String, val embedding: FloatArray, val chunkIndex: Int)

data class VectorFilter(
  val notebookIds: Set<NotebookId>? = null,
  val tagIds: Set<TagId>? = null,
  val excludeAi: Boolean = true,
  val dateRange: DateRange? = null
)
```

---

## Responsibilities

- Chunk note body into ~500-token windows with 50-token overlap before embedding.
- Trigger: on note insert/update, an Edge Function enqueues an embedding job.
- pgvector index: HNSW with cosine distance, one index per namespace.
- Namespace = `${provider}:${model}` (e.g., `ollama:nomic-embed-text`).
- Filter pushdown: VectorFilter → SQL WHERE clauses (notebook_id, tags, date range, ai_excluded flag).
- Backfill script that embeds the entire corpus on first run (or on embedding-model switch).
- Idempotency: re-embedding the same note version is a no-op.

---

## Deliverables

- Migration adding `note_embeddings` table with vector column, namespace text, GIN/HNSW indexes.
- Edge Function `embeddings/index` (idempotent, retryable).
- Postgres trigger or pg_cron job that enqueues re-indexing on note update.
- Backfill script `scripts/backfill-embeddings.ts` with progress logging.
- Tests for chunking, retrieval correctness, namespace isolation.

---

## Relevant Data Model

- `note_embeddings`

(Full schema: `reference/data-model.md`)

---

## Relevant API Endpoints

- `POST /functions/v1/embeddings/index (internal, called by trigger)`

(Full API contract: `reference/api-contract.md`)

---

## Definition of Done

Apply the checklist in `reference/definition-of-done.md` in full. The
module-specific extras are:

- All items in **Deliverables** above are produced and reviewed.
- All items in **Responsibilities** above are demonstrably true (point at the
  code that proves each one).
- The module-specific tests listed in the **Ready-to-Use Prompt** below pass
  in CI.

---

## Ready-to-Use Prompt (paste this into Claude Code / Cursor)

```
You are implementing module M10 (Embedding & Vector Search) of the Evernote-like
notes app. Read `tech-specs/M10-embedding-vector.md` before starting.

Prerequisites:
  - M1, M4 done.
  - Supabase project has `pgvector` extension enabled
    (run `CREATE EXTENSION IF NOT EXISTS vector;`).
  - M9 (ai-services) provides `embed(texts, model)` OR a stub that returns
    deterministic 768-dim vectors for tests.

Your job:
  1. SQL migration:
       CREATE TABLE note_embeddings (
         id uuid primary key default gen_random_uuid(),
         owner_id uuid not null references auth.users(id),
         note_id uuid not null references notes(id) on delete cascade,
         namespace text not null,        -- e.g., 'ollama:nomic-embed-text'
         chunk_index int not null,
         content text not null,
         embedding vector(768) not null, -- 768 for nomic-embed-text
         created_at timestamptz default now(),
         UNIQUE (note_id, namespace, chunk_index)
       );
       -- HNSW index per namespace via partial indexes:
       CREATE INDEX idx_emb_nomic ON note_embeddings
         USING hnsw (embedding vector_cosine_ops)
         WHERE namespace = 'ollama:nomic-embed-text';
       -- RLS:
       ALTER TABLE note_embeddings ENABLE ROW LEVEL SECURITY;
       CREATE POLICY owner_can_all ON note_embeddings FOR ALL
         USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

  2. Chunker: split note body (plaintext extracted from ProseMirror JSON) into
     ~500-token windows with 50-token overlap. Use tiktoken or a simple
     word-based approximation (~750 chars per chunk).

  3. Edge Function `embeddings/index`:
       Input: { noteId, namespace }
       Steps:
         a) Load note from notes table; if is_trashed or ai_excluded, delete
            its embeddings for this namespace and return.
         b) Chunk the body.
         c) Call M9.embed(chunks.map(c => c.text), namespaceModel).
         d) UPSERT rows in note_embeddings (delete old, insert new for this
            namespace + note).

  4. Trigger: AFTER INSERT/UPDATE OF body_json ON notes, enqueue an embedding
     job. Use pg_net.http_post to the Edge Function, OR a pg_cron worker that
     polls a job_queue table.

  5. Vector search function (SQL):
       CREATE FUNCTION vector_search(
         query_embedding vector(768),
         k int,
         filter_namespace text,
         filter_notebooks uuid[] DEFAULT NULL,
         filter_tags uuid[] DEFAULT NULL,
         exclude_ai boolean DEFAULT true
       ) RETURNS TABLE (note_id uuid, chunk_index int, content text, distance float)
       LANGUAGE sql AS $$
         SELECT ne.note_id, ne.chunk_index, ne.content,
                ne.embedding <=> query_embedding AS distance
         FROM note_embeddings ne
         JOIN notes n ON n.id = ne.note_id
         WHERE ne.owner_id = auth.uid()
           AND ne.namespace = filter_namespace
           AND NOT n.is_trashed
           AND (NOT exclude_ai OR NOT n.ai_excluded)
           AND (filter_notebooks IS NULL OR n.notebook_id = ANY(filter_notebooks))
         ORDER BY distance ASC LIMIT k;
       $$;

  6. Backfill script: iterate over all non-trashed notes; for each, call the
     Edge Function. Log progress to stdout.

Tests:
  - Chunker: a 1500-token note produces 3 chunks with correct overlap.
  - Round-trip: insert a note, wait for trigger, search for keywords in the
    note, verify it's returned in top results.
  - Namespace isolation: two namespaces don't see each other's vectors.

Definition of Done is in the spec.
```

---

## Cross-references

- Master architecture: `../NotesApp_Architecture.docx` → §7.10
- Getting-started workflow: `../GETTING_STARTED.md`
- Definition of Done: `../reference/definition-of-done.md`
- Data model: `../reference/data-model.md`
- API contract: `../reference/api-contract.md`
