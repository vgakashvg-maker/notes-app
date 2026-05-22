-- M08 — calendar mirror.
--
-- events_mirror caches Google Calendar events for offline read + unified
-- search; calendar/sync upserts on (provider, external_event_id) and
-- deletes mirror rows whose external id no longer appears in the range.
--
-- note_event_links is the back-reference written by calendar/create-event
-- when the source of a calendar event is a note.

create table if not exists public.events_mirror (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('GOOGLE_CALENDAR', 'MICROSOFT_GRAPH')),
    external_event_id text not null,
    calendar_id text not null,
    title text not null,
    description text,
    start_at timestamptz not null,
    end_at timestamptz not null check (end_at >= start_at),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, provider, external_event_id)
);

create index if not exists events_mirror_owner_start_idx
    on public.events_mirror (owner_id, start_at);

-- Stamp owner from auth.uid() — same pattern as ai_conversations.
create or replace function public.events_mirror_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.owner_id is null then
        new.owner_id := auth.uid();
    end if;
    if new.owner_id is null then
        raise exception 'events_mirror: caller has no auth.uid()';
    end if;
    return new;
end;
$$;

drop trigger if exists events_mirror_stamp_owner_trigger on public.events_mirror;
create trigger events_mirror_stamp_owner_trigger
before insert on public.events_mirror
for each row execute function public.events_mirror_stamp_owner();

drop trigger if exists set_updated_at_on_events_mirror on public.events_mirror;
create trigger set_updated_at_on_events_mirror
before update on public.events_mirror
for each row execute function public.set_updated_at();

alter table public.events_mirror enable row level security;
drop policy if exists "owner_can_all" on public.events_mirror;
create policy "owner_can_all" on public.events_mirror
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

comment on table public.events_mirror is
    'M08 — cache of Google Calendar events for offline read + unified search.';

-- ----------------------------------------------------------------------------
-- note_event_links — back-reference written by calendar/create-event.
-- ----------------------------------------------------------------------------

create table if not exists public.note_event_links (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid not null references public.notes(id) on delete cascade,
    event_mirror_id uuid not null references public.events_mirror(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (note_id, event_mirror_id)
);

create index if not exists note_event_links_owner_note_idx
    on public.note_event_links (owner_id, note_id);

-- Stamp owner from the parent note (mirrors note_tags_stamp_owner).
create or replace function public.note_event_links_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    note_owner uuid;
    event_owner uuid;
begin
    select owner_id into note_owner from public.notes where id = new.note_id;
    select owner_id into event_owner from public.events_mirror where id = new.event_mirror_id;
    if note_owner is null then
        raise exception 'note_event_links.note_id %: unknown note', new.note_id;
    end if;
    if event_owner is null then
        raise exception 'note_event_links.event_mirror_id %: unknown event', new.event_mirror_id;
    end if;
    if note_owner <> event_owner then
        raise exception 'note_event_links: note and event belong to different owners';
    end if;
    new.owner_id := note_owner;
    return new;
end;
$$;

drop trigger if exists note_event_links_stamp_owner_trigger on public.note_event_links;
create trigger note_event_links_stamp_owner_trigger
before insert on public.note_event_links
for each row execute function public.note_event_links_stamp_owner();

alter table public.note_event_links enable row level security;
drop policy if exists "owner_can_all" on public.note_event_links;
create policy "owner_can_all" on public.note_event_links
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

comment on table public.note_event_links is
    'M08 — back-reference from a note to a calendar event created from it.';
