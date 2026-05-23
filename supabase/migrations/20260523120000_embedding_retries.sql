-- BUG-006 hardening — when embeddings/index can't reach Ollama, the
-- trigger used to log a WARNING and drop the work on the floor (the
-- BUG-006 test notes were stranded that way). This migration adds a
-- retry queue + a pg_cron consumer that re-touches stranded notes,
-- which fires `notes_embed_trigger` again.

create table if not exists public.embedding_retries (
    note_id uuid primary key references public.notes(id) on delete cascade,
    owner_id uuid not null,
    namespace text not null,
    attempts integer not null default 0,
    last_error text,
    next_attempt_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists embedding_retries_due_idx
    on public.embedding_retries (next_attempt_at)
    where attempts < 5;

drop trigger if exists set_updated_at_on_embedding_retries on public.embedding_retries;
create trigger set_updated_at_on_embedding_retries
before update on public.embedding_retries
for each row execute function public.set_updated_at();

-- No RLS policy → service-role bypass only; this table is internal
-- bookkeeping, never user-facing.
alter table public.embedding_retries enable row level security;

comment on table public.embedding_retries is
    'BUG-006 — notes whose embedding call to Ollama failed. m10_embedding_retry cron retries.';

-- pg_cron consumer. Every 15 min: touch each due note (the trigger
-- re-enqueues the embedding job via pg_net.http_post) and bump the
-- exponential-backoff attempt counter so a permanently-broken note
-- stops being retried after attempt 5.
do $$
declare existing_jobid bigint;
begin
    select jobid into existing_jobid from cron.job where jobname = 'm10_embedding_retry';
    if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end;
$$;

select cron.schedule(
    'm10_embedding_retry',
    '*/15 * * * *',
    $$
        with due as (
            select note_id from public.embedding_retries
             where next_attempt_at <= now()
               and attempts < 5
             order by next_attempt_at
             limit 100
        )
        update public.notes
           set updated_at = now()
         where id in (select note_id from due);

        update public.embedding_retries
           set attempts = attempts + 1,
               next_attempt_at = now() + (interval '15 minutes' * (attempts + 1))
         where next_attempt_at <= now()
           and attempts < 5;
    $$
);
