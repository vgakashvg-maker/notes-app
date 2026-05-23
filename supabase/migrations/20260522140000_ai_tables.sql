-- M09 — Second-Brain AI tables.
--
-- Four tables share the same RLS pattern as the rest of the schema:
-- owner_id is stamped from the JWT on insert (no client-supplied
-- owner_id), and owner_can_all is the only policy. Cross-tenant access
-- is impossible by construction.

-- ----------------------------------------------------------------------------
-- ai_conversations — one row per chat thread.
-- ----------------------------------------------------------------------------

create table if not exists public.ai_conversations (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'New conversation' check (length(trim(title)) > 0),
    model_hint text,
    archived_summary text,
    created_at timestamptz not null default now(),
    last_message_at timestamptz not null default now()
);

comment on table public.ai_conversations is
    'M09 — persistent chat threads. archived_summary holds compressed older turns.';

drop trigger if exists set_updated_at_on_ai_conversations on public.ai_conversations;
create trigger set_updated_at_on_ai_conversations
before update on public.ai_conversations
for each row execute function public.set_updated_at();

-- Stamp owner_id from auth.uid() on insert. Clients send no owner_id;
-- this matches the note_tags pattern.
create or replace function public.ai_conversations_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.owner_id is null then
        new.owner_id := auth.uid();
    end if;
    if new.owner_id is null then
        raise exception 'ai_conversations: caller has no auth.uid()';
    end if;
    return new;
end;
$$;

drop trigger if exists ai_conversations_stamp_owner_trigger on public.ai_conversations;
create trigger ai_conversations_stamp_owner_trigger
before insert on public.ai_conversations
for each row execute function public.ai_conversations_stamp_owner();

create index if not exists ai_conversations_owner_last_idx
    on public.ai_conversations (owner_id, last_message_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists "owner_can_all" on public.ai_conversations;
create policy "owner_can_all" on public.ai_conversations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ai_messages — one row per turn (user or assistant).
-- ----------------------------------------------------------------------------

create table if not exists public.ai_messages (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
    role text not null check (role in ('system', 'user', 'assistant')),
    content text not null,
    citations jsonb not null default '[]'::jsonb,
    provider text check (provider in ('OLLAMA', 'ANTHROPIC', 'OPENAI', 'GROQ')),
    model text,
    prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
    completion_tokens integer not null default 0 check (completion_tokens >= 0),
    cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
    created_at timestamptz not null default now()
);

-- Stamp owner_id from the parent conversation. Keeps it in lockstep
-- without the client having to set it (and so RLS protects every row
-- even if a client tries to insert with a spoofed owner_id).
create or replace function public.ai_messages_stamp_owner() returns trigger
language plpgsql as $$
declare
    conv_owner uuid;
begin
    select owner_id into conv_owner from public.ai_conversations where id = new.conversation_id;
    if conv_owner is null then
        raise exception 'ai_messages: unknown conversation %', new.conversation_id;
    end if;
    new.owner_id := conv_owner;
    return new;
end;
$$;

drop trigger if exists ai_messages_stamp_owner_trigger on public.ai_messages;
create trigger ai_messages_stamp_owner_trigger
before insert or update of conversation_id on public.ai_messages
for each row execute function public.ai_messages_stamp_owner();

-- Bump the parent conversation's last_message_at whenever a new
-- message lands. Keeps the sidebar ordering accurate without a
-- separate write from the client.
create or replace function public.ai_messages_bump_conversation() returns trigger
language plpgsql as $$
begin
    -- clock_timestamp() rather than now() so two messages inserted in
    -- the same transaction get distinct timestamps. now() is fixed at
    -- transaction start, which is fine for last_message_at in real
    -- usage but breaks pgTAP suites that exercise both inserts in
    -- one BEGIN block.
    update public.ai_conversations
    set last_message_at = clock_timestamp()
    where id = new.conversation_id;
    return new;
end;
$$;

drop trigger if exists ai_messages_bump_conversation_trigger on public.ai_messages;
create trigger ai_messages_bump_conversation_trigger
after insert on public.ai_messages
for each row execute function public.ai_messages_bump_conversation();

create index if not exists ai_messages_conversation_idx
    on public.ai_messages (conversation_id, created_at asc);

alter table public.ai_messages enable row level security;
drop policy if exists "owner_can_all" on public.ai_messages;
create policy "owner_can_all" on public.ai_messages
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ai_memory — long-term facts about the user.
-- ----------------------------------------------------------------------------

create table if not exists public.ai_memory (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    fact text not null check (length(trim(fact)) > 0),
    source text not null check (source in ('user', 'derived')),
    confidence real not null default 1.0 check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now()
);

create index if not exists ai_memory_owner_idx on public.ai_memory (owner_id, last_used_at desc);

alter table public.ai_memory enable row level security;
drop policy if exists "owner_can_all" on public.ai_memory;
create policy "owner_can_all" on public.ai_memory
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ai_usage_log — telemetry. $0 cost in V1 (Ollama only) but we record
-- the latency + token counts so the M15 settings panel can show
-- something useful.
-- ----------------------------------------------------------------------------

create table if not exists public.ai_usage_log (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('OLLAMA', 'ANTHROPIC', 'OPENAI', 'GROQ')),
    model text not null,
    task text not null check (task in (
        'chat', 'summarize', 'suggest_tags', 'suggest_title',
        'extract_actions', 'rewrite', 'briefing', 'compression', 'embed'
    )),
    prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
    completion_tokens integer not null default 0 check (completion_tokens >= 0),
    cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
    latency_ms integer not null default 0 check (latency_ms >= 0),
    at timestamptz not null default now()
);

create index if not exists ai_usage_log_owner_at_idx
    on public.ai_usage_log (owner_id, at desc);

alter table public.ai_usage_log enable row level security;
drop policy if exists "owner_can_all" on public.ai_usage_log;
create policy "owner_can_all" on public.ai_usage_log
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Daily briefing pg_cron job.
-- Fires at 08:00 UTC for V1 (per-user timezone routing lives in M15).
-- No-ops if app.settings.supabase_url / service_role_key are unset, so
-- the cron schedule is safe to create before the Edge Function is
-- deployed.
-- ----------------------------------------------------------------------------

do $$
declare existing_jobid bigint;
begin
    select jobid into existing_jobid from cron.job where jobname = 'm09_daily_briefing';
    if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end;
$$;

select cron.schedule(
    'm09_daily_briefing',
    '0 8 * * *',
    $$
        select net.http_post(
            url := coalesce(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/ai-briefing',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
            ),
            body := jsonb_build_object('date', (now() at time zone 'utc')::date::text)
        )
        where coalesce(current_setting('app.settings.supabase_url', true), '') <> ''
          and coalesce(current_setting('app.settings.service_role_key', true), '') <> '';
    $$
);
