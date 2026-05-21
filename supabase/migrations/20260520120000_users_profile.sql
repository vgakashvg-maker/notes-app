-- M02 — users_profile table.
--
-- Owned by M02 because the auth module is the first thing that touches it
-- (creates the row on first sign-in) and the refresh-provider-token Edge
-- Function reads/writes the encrypted refresh-token columns. M01 (Domain)
-- defines the matching TypeScript / Kotlin shapes; M15 (AI Settings) will
-- mutate `ai_prefs` once that module lands.

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------

-- pgcrypto gives us gen_random_uuid() and the crypt() helpers used elsewhere.
create extension if not exists pgcrypto;

-- Supabase ships pgsodium for column-level encryption (used here for refresh
-- tokens). It's already enabled on hosted projects; the IF NOT EXISTS keeps
-- this idempotent for local supabase start.
create extension if not exists pgsodium;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table if not exists public.users_profile (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null check (length(trim(display_name)) > 0),
    storage_provider text check (storage_provider in ('GOOGLE_DRIVE', 'ONEDRIVE')),
    calendar_provider text check (calendar_provider in ('GOOGLE_CALENDAR', 'MICROSOFT_GRAPH')),
    ai_prefs jsonb not null default jsonb_build_object(
        'chatProvider', 'OLLAMA',
        'chatModel', 'qwen2.5:7b',
        'tagProvider', 'OLLAMA',
        'tagModel', 'llama3.2:3b',
        'embeddingProvider', 'OLLAMA',
        'embeddingModel', 'nomic-embed-text'
    ),
    analytics_optout boolean not null default false,
    -- Encrypted refresh tokens (one per ExternalProviderId). Plaintext never
    -- leaves the database; the auth/refresh-provider-token Edge Function
    -- decrypts via the service-role connection at call time and exchanges
    -- the result for a short-lived access token.
    google_drive_refresh_token bytea,
    google_calendar_refresh_token bytea,
    google_userinfo_refresh_token bytea,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.users_profile is
    'Per-user settings + encrypted OAuth refresh tokens. Owned by M02.';

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_updated_at_on_users_profile on public.users_profile;
create trigger set_updated_at_on_users_profile
before update on public.users_profile
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create the profile on first sign-in.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.users_profile (user_id, display_name)
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            split_part(new.email, '@', 1)
        )
    )
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RLS — owner_id pattern as documented in reference/data-model.md.
-- ----------------------------------------------------------------------------

alter table public.users_profile enable row level security;

drop policy if exists "owner_can_select" on public.users_profile;
create policy "owner_can_select" on public.users_profile
for select using (user_id = auth.uid());

drop policy if exists "owner_can_update" on public.users_profile;
create policy "owner_can_update" on public.users_profile
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Inserts go through the on_auth_user_created trigger (security definer);
-- direct client inserts are not allowed. Same for deletes.
revoke insert, delete on public.users_profile from anon, authenticated;
