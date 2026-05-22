-- M11 — reminders table. Local-only in V1 (the device schedules an
-- AlarmManager / setTimeout firing); the row is the source of truth so
-- the device can re-hydrate after reboot or a fresh sign-in. V2's FCM
-- pipeline reads the same table when sending push.

create table if not exists public.reminders (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid references public.notes(id) on delete cascade,
    fire_at timestamptz not null,
    title text not null check (length(trim(title)) > 0),
    body text,
    status text not null default 'scheduled'
        check (status in ('scheduled', 'fired', 'cancelled')),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists reminders_owner_fire_at_idx
    on public.reminders (owner_id, fire_at)
    where status = 'scheduled';

-- Stamp owner from auth.uid() when omitted. Same pattern as
-- ai_conversations / events_mirror.
create or replace function public.reminders_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    note_owner uuid;
begin
    if new.note_id is not null then
        select owner_id into note_owner from public.notes where id = new.note_id;
        if note_owner is null then
            raise exception 'reminders.note_id %: unknown note', new.note_id;
        end if;
        if new.owner_id is not null and new.owner_id <> note_owner then
            raise exception 'reminders: note and reminder belong to different owners';
        end if;
        new.owner_id := note_owner;
    end if;
    if new.owner_id is null then
        new.owner_id := auth.uid();
    end if;
    if new.owner_id is null then
        raise exception 'reminders: caller has no auth.uid()';
    end if;
    return new;
end;
$$;

drop trigger if exists reminders_stamp_owner_trigger on public.reminders;
create trigger reminders_stamp_owner_trigger
before insert on public.reminders
for each row execute function public.reminders_stamp_owner();

drop trigger if exists set_updated_at_on_reminders on public.reminders;
create trigger set_updated_at_on_reminders
before update on public.reminders
for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;
drop policy if exists "owner_can_all" on public.reminders;
create policy "owner_can_all" on public.reminders
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

comment on table public.reminders is
    'M11 — scheduled reminders. fire_at is timestamptz; device rehydrates on boot.';
