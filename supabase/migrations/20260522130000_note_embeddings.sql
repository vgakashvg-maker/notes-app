-- M10 — note_embeddings + HNSW indexes + vector_search() + trigger.
--
-- One row per (note, namespace, chunk_index). The namespace pattern is
-- `${provider}:${model}` (e.g. 'ollama:nomic-embed-text') so multiple
-- embedding models can coexist while we migrate between them. ADR 0008
-- captures the rationale.

create extension if not exists vector;

-- ----------------------------------------------------------------------------
-- note_embeddings
-- ----------------------------------------------------------------------------

create table if not exists public.note_embeddings (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid not null references public.notes(id) on delete cascade,
    namespace text not null check (length(trim(namespace)) > 0),
    chunk_index int not null check (chunk_index >= 0),
    content text not null check (length(content) > 0),
    embedding vector(768) not null,
    created_at timestamptz not null default now(),
    unique (note_id, namespace, chunk_index)
);

comment on table public.note_embeddings is
    'M10 — per-chunk vector embeddings. Namespace = provider:model.';

-- Stamp owner_id from the note's owner on insert / update, the same
-- way note_tags does in M04. The client never sets owner_id directly.
create or replace function public.note_embeddings_stamp_owner() returns trigger
language plpgsql as $$
declare
    note_owner uuid;
begin
    select owner_id into note_owner from public.notes where id = new.note_id;
    if note_owner is null then
        raise exception 'note_embeddings: unknown note %', new.note_id;
    end if;
    new.owner_id := note_owner;
    return new;
end;
$$;

drop trigger if exists note_embeddings_stamp_owner_trigger on public.note_embeddings;
create trigger note_embeddings_stamp_owner_trigger
before insert or update on public.note_embeddings
for each row execute function public.note_embeddings_stamp_owner();

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- Per-namespace HNSW partial indexes. Cosine distance matches the
-- normalisation Ollama / nomic-embed-text return. Each future namespace
-- gets its own partial index (the M09 / M15 modules will add more).
create index if not exists idx_emb_ollama_nomic on public.note_embeddings
    using hnsw (embedding vector_cosine_ops)
    where namespace = 'ollama:nomic-embed-text';

create index if not exists note_embeddings_note_idx on public.note_embeddings (note_id);
create index if not exists note_embeddings_owner_namespace_idx
    on public.note_embeddings (owner_id, namespace);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.note_embeddings enable row level security;

drop policy if exists "owner_can_all" on public.note_embeddings;
create policy "owner_can_all" on public.note_embeddings
for all using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- vector_search() — RAG entry point.
--   * Filter pushdown for namespace, notebook ids, tag ids, ai_excluded.
--   * Always confines to auth.uid() so RLS-style isolation holds even
--     when the function is called with a user JWT.
-- ----------------------------------------------------------------------------

create or replace function public.vector_search(
    query_embedding vector(768),
    k int,
    filter_namespace text,
    filter_notebooks uuid[] default null,
    filter_tags uuid[] default null,
    exclude_ai boolean default true
) returns table (
    note_id uuid,
    chunk_index int,
    content text,
    distance float
)
language sql
stable
security invoker
as $$
    select ne.note_id,
           ne.chunk_index,
           ne.content,
           (ne.embedding <=> query_embedding)::float as distance
    from public.note_embeddings ne
    join public.notes n on n.id = ne.note_id
    where ne.owner_id = auth.uid()
      and ne.namespace = filter_namespace
      and not n.is_trashed
      and (not exclude_ai or not n.ai_excluded)
      and (filter_notebooks is null or n.notebook_id = any(filter_notebooks))
      and (
          filter_tags is null
          or exists (
              select 1 from public.note_tags nt
              where nt.note_id = ne.note_id and nt.tag_id = any(filter_tags)
          )
      )
    order by distance asc
    limit k;
$$;

comment on function public.vector_search is
    'M10 — top-k cosine retrieval with notebook / tag / ai_excluded filters. RLS-scoped via auth.uid().';

-- ----------------------------------------------------------------------------
-- Trigger: enqueue re-index on note body / title changes.
-- ----------------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.notes_enqueue_embedding() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    supabase_url text;
    service_key text;
begin
    -- Only fire when the body or title actually changed. Tag-only
    -- updates and is_pinned flips do not invalidate embeddings.
    if tg_op = 'UPDATE' and new.body_json is not distinct from old.body_json
        and new.title = old.title
        and new.is_trashed = old.is_trashed
        and new.ai_excluded = old.ai_excluded then
        return new;
    end if;

    -- Read the URL + service-role key the database admin sets via
    --   alter database postgres set app.settings.supabase_url = '...';
    -- If either is absent the trigger no-ops — keeps INSERTs working
    -- in dev / test environments where the Edge Function isn't deployed
    -- yet. The backfill script catches up later.
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
    if supabase_url is null or supabase_url = '' or service_key is null or service_key = '' then
        return new;
    end if;

    -- Fire-and-forget. The Edge Function is idempotent (re-embedding
    -- the same note version is a no-op against unique(note_id,
    -- namespace, chunk_index)) so a duplicate enqueue is harmless.
    begin
        perform net.http_post(
            url := supabase_url || '/functions/v1/embeddings-index',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
                'noteId', new.id::text,
                'namespace', 'ollama:nomic-embed-text'
            )
        );
    exception when others then
        -- The trigger must never block the INSERT path. A failed
        -- enqueue surfaces in pg_net's job table for inspection.
        raise warning 'notes_enqueue_embedding: http_post failed: %', sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists notes_embed_trigger on public.notes;
create trigger notes_embed_trigger
after insert or update of body_json, title, is_trashed, ai_excluded on public.notes
for each row execute function public.notes_enqueue_embedding();
