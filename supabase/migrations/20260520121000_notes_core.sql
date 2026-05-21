-- M04 — Notes Core schema.
--
-- All M04 tables (notebooks, tags, notes, note_tags, attachments_refs) plus
-- triggers, indexes, and RLS. Shape follows reference/data-model.md exactly.
-- The set_updated_at() function is reused from the M02 migration.

-- ----------------------------------------------------------------------------
-- notebooks
-- ----------------------------------------------------------------------------

create table if not exists public.notebooks (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    color text not null default '#7c7c7c' check (color ~ '^#[0-9a-fA-F]{6}$'),
    sort_order integer not null default 0 check (sort_order >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.notebooks is 'M04 — one level deep notebook hierarchy.';

drop trigger if exists set_updated_at_on_notebooks on public.notebooks;
create trigger set_updated_at_on_notebooks
before update on public.notebooks
for each row execute function public.set_updated_at();

create index if not exists notebooks_owner_sort_idx
    on public.notebooks (owner_id, sort_order, name);

alter table public.notebooks enable row level security;

drop policy if exists "owner_can_all" on public.notebooks;
create policy "owner_can_all" on public.notebooks
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- tags
-- ----------------------------------------------------------------------------

create table if not exists public.tags (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    color text not null default '#7c7c7c' check (color ~ '^#[0-9a-fA-F]{6}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.tags is 'M04 — per-user tag dictionary; case-insensitive uniqueness on name.';

create unique index if not exists tags_owner_name_unique
    on public.tags (owner_id, lower(name));

drop trigger if exists set_updated_at_on_tags on public.tags;
create trigger set_updated_at_on_tags
before update on public.tags
for each row execute function public.set_updated_at();

alter table public.tags enable row level security;

drop policy if exists "owner_can_all" on public.tags;
create policy "owner_can_all" on public.tags
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- notes
-- ----------------------------------------------------------------------------

create table if not exists public.notes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    notebook_id uuid references public.notebooks(id) on delete set null,
    title text not null check (length(trim(title)) > 0),
    body_json jsonb not null default jsonb_build_object('type', 'doc', 'content', '[]'::jsonb),
    body_tsv tsvector,
    is_pinned boolean not null default false,
    is_trashed boolean not null default false,
    trashed_at timestamptz,
    ai_excluded boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint notes_trashed_at_matches_flag check (
        (is_trashed = true and trashed_at is not null)
        or (is_trashed = false and trashed_at is null)
    ),
    constraint notes_notebook_owner_match check (
        notebook_id is null
        or owner_id = (select owner_id from public.notebooks where id = notebook_id)
    )
);

comment on table public.notes is 'M04 — note records. body_json is ProseMirror JSON; body_tsv is the FTS column.';

-- Plain-text extraction from ProseMirror JSON for the tsvector. Walks any
-- "text" string nodes; small + deterministic + safe with arbitrary JSON.
create or replace function public.extract_plain_from_prosemirror(body jsonb)
returns text
language plpgsql
immutable
as $$
declare
    accum text := '';
    node jsonb;
begin
    if body is null then return ''; end if;
    if jsonb_typeof(body) = 'string' then
        return body #>> '{}';
    end if;
    if jsonb_typeof(body) = 'object' then
        if body ? 'text' and jsonb_typeof(body->'text') = 'string' then
            accum := accum || (body->>'text') || ' ';
        end if;
        if body ? 'content' and jsonb_typeof(body->'content') = 'array' then
            for node in select * from jsonb_array_elements(body->'content') loop
                accum := accum || public.extract_plain_from_prosemirror(node) || ' ';
            end loop;
        end if;
    elsif jsonb_typeof(body) = 'array' then
        for node in select * from jsonb_array_elements(body) loop
            accum := accum || public.extract_plain_from_prosemirror(node) || ' ';
        end loop;
    end if;
    return accum;
end;
$$;

create or replace function public.notes_set_body_tsv() returns trigger
language plpgsql
as $$
begin
    new.body_tsv := setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
        || setweight(to_tsvector('simple', public.extract_plain_from_prosemirror(new.body_json)), 'B');
    return new;
end;
$$;

drop trigger if exists notes_tsv_trigger on public.notes;
create trigger notes_tsv_trigger
before insert or update of title, body_json on public.notes
for each row execute function public.notes_set_body_tsv();

drop trigger if exists set_updated_at_on_notes on public.notes;
create trigger set_updated_at_on_notes
before update on public.notes
for each row execute function public.set_updated_at();

create index if not exists notes_owner_updated_idx
    on public.notes (owner_id, updated_at desc) where is_trashed = false;

create index if not exists notes_owner_trashed_idx
    on public.notes (owner_id, trashed_at) where is_trashed = true;

create index if not exists notes_body_tsv_idx
    on public.notes using gin (body_tsv);

create index if not exists notes_notebook_idx
    on public.notes (notebook_id) where notebook_id is not null;

alter table public.notes enable row level security;

drop policy if exists "owner_can_all" on public.notes;
create policy "owner_can_all" on public.notes
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- note_tags (join table)
-- ----------------------------------------------------------------------------

create table if not exists public.note_tags (
    note_id uuid not null references public.notes(id) on delete cascade,
    tag_id uuid not null references public.tags(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (note_id, tag_id)
);

create index if not exists note_tags_tag_idx on public.note_tags (tag_id);
create index if not exists note_tags_owner_idx on public.note_tags (owner_id);

alter table public.note_tags enable row level security;

drop policy if exists "owner_can_all" on public.note_tags;
create policy "owner_can_all" on public.note_tags
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- attachments_refs (M04 owns the schema; M07 owns the pipeline that fills it)
-- ----------------------------------------------------------------------------

create table if not exists public.attachments_refs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid not null references public.notes(id) on delete cascade,
    provider text not null check (provider in ('GOOGLE_DRIVE', 'ONEDRIVE')),
    external_id text not null check (length(trim(external_id)) > 0),
    display_name text not null check (length(trim(display_name)) > 0),
    mime text not null check (mime ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$'),
    size_bytes bigint not null check (size_bytes >= 0),
    thumbnail_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists attachments_refs_note_idx on public.attachments_refs (note_id);
create index if not exists attachments_refs_owner_idx on public.attachments_refs (owner_id);

drop trigger if exists set_updated_at_on_attachments_refs on public.attachments_refs;
create trigger set_updated_at_on_attachments_refs
before update on public.attachments_refs
for each row execute function public.set_updated_at();

alter table public.attachments_refs enable row level security;

drop policy if exists "owner_can_all" on public.attachments_refs;
create policy "owner_can_all" on public.attachments_refs
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Cross-table integrity: stamp owner_id on join rows automatically so the
-- client never has to set it (and can't get it wrong).
-- ----------------------------------------------------------------------------

create or replace function public.note_tags_stamp_owner() returns trigger
language plpgsql
as $$
declare
    note_owner uuid;
    tag_owner uuid;
begin
    select owner_id into note_owner from public.notes where id = new.note_id;
    select owner_id into tag_owner from public.tags where id = new.tag_id;
    if note_owner is null then
        raise exception 'note_tags: unknown note %', new.note_id;
    end if;
    if tag_owner is null then
        raise exception 'note_tags: unknown tag %', new.tag_id;
    end if;
    if note_owner <> tag_owner then
        raise exception 'note_tags: note and tag belong to different owners';
    end if;
    new.owner_id := note_owner;
    return new;
end;
$$;

drop trigger if exists note_tags_stamp_owner_trigger on public.note_tags;
create trigger note_tags_stamp_owner_trigger
before insert or update on public.note_tags
for each row execute function public.note_tags_stamp_owner();
