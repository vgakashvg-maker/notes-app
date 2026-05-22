-- M15 — ai_keys table for the V2 multi-provider key store. RLS enforced
-- but the table is intentionally unused in V1 (the Ollama endpoint is
-- public on the user's home network; no secret to store yet). M15 ships
-- the schema + RLS so V2's "add Anthropic/OpenAI" change is a one-line
-- INSERT instead of a schema migration.
--
-- users_profile.ai_prefs (jsonb) was created in M02 and gains the
-- `.routing` + `.endpoints` keys in this module — no DDL needed.
-- ai_usage_log already exists from M09; the new `ai/usage` Edge
-- Function reads from it directly.

create table if not exists public.ai_keys (
    owner_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('OLLAMA', 'ANTHROPIC', 'OPENAI')),
    -- Encrypted via pgsodium / Supabase Vault when V2 lights this up.
    encrypted_secret bytea,
    -- Optional per-provider endpoint override; Ollama uses this in V1
    -- via the ai_prefs.endpoints map instead, so this column stays null
    -- until V2.
    endpoint_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (owner_id, provider)
);

-- Stamp owner from auth.uid() (same pattern as ai_conversations).
create or replace function public.ai_keys_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.owner_id is null then
        new.owner_id := auth.uid();
    end if;
    if new.owner_id is null then
        raise exception 'ai_keys: caller has no auth.uid()';
    end if;
    return new;
end;
$$;

drop trigger if exists ai_keys_stamp_owner_trigger on public.ai_keys;
create trigger ai_keys_stamp_owner_trigger
before insert on public.ai_keys
for each row execute function public.ai_keys_stamp_owner();

drop trigger if exists set_updated_at_on_ai_keys on public.ai_keys;
create trigger set_updated_at_on_ai_keys
before update on public.ai_keys
for each row execute function public.set_updated_at();

alter table public.ai_keys enable row level security;
drop policy if exists "owner_can_all" on public.ai_keys;
create policy "owner_can_all" on public.ai_keys
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

comment on table public.ai_keys is
    'M15 — per-provider API key store. V2 lights up encryption + reads; V1 ships the shape.';
