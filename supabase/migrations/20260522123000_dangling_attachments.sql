-- M07 — dangling-attachments registry + scheduled validator job.
--
-- The attachments_refs table (M04) points at external files in Drive
-- (or, eventually, OneDrive / S3). A user moving or deleting a file
-- in Drive breaks our reference. The validator (run daily via
-- pg_cron, see below) probes each row and records 404s here for user
-- review.

create table if not exists public.dangling_attachments (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    attachment_id uuid not null references public.attachments_refs(id) on delete cascade,
    external_id text not null check (length(trim(external_id)) > 0),
    missing_original boolean not null,
    missing_thumbnail boolean not null,
    detected_at timestamptz not null default now(),
    constraint dangling_attachments_at_least_one_missing check (
        missing_original or missing_thumbnail
    )
);

-- CHECK constraints can't reference another table. The owner_id stays
-- in lockstep with attachments_refs.owner_id via a BEFORE-INSERT/UPDATE
-- trigger that stamps owner_id from the linked row.
create or replace function public.dangling_attachments_stamp_owner() returns trigger
language plpgsql as $$
declare
    src_owner uuid;
begin
    select owner_id into src_owner from public.attachments_refs where id = new.attachment_id;
    if src_owner is null then
        raise exception 'dangling_attachments: unknown attachment %', new.attachment_id;
    end if;
    new.owner_id := src_owner;
    return new;
end;
$$;

drop trigger if exists dangling_attachments_stamp_owner_trigger on public.dangling_attachments;
create trigger dangling_attachments_stamp_owner_trigger
before insert or update on public.dangling_attachments
for each row execute function public.dangling_attachments_stamp_owner();

create unique index if not exists dangling_attachments_attachment_idx
    on public.dangling_attachments (attachment_id);

create index if not exists dangling_attachments_owner_detected_idx
    on public.dangling_attachments (owner_id, detected_at desc);

comment on table public.dangling_attachments is
    'M07 — attachments_refs rows whose external bytes are missing on the storage provider. Repopulated daily.';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.dangling_attachments enable row level security;

drop policy if exists "owner_can_select" on public.dangling_attachments;
create policy "owner_can_select" on public.dangling_attachments
for select using (owner_id = auth.uid());

-- Writes only via the validator (service-role); clients see the rows but cannot mutate.
revoke insert, update, delete on public.dangling_attachments from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Scheduled validator — daily at 04:00 UTC (per data-model.md).
-- Calls the attachments/validate Edge Function via pg_net.
-- ----------------------------------------------------------------------------

create extension if not exists pg_net;

do $$
declare
    existing_jobid bigint;
begin
    select jobid into existing_jobid from cron.job where jobname = 'm07_attachment_validate';
    if existing_jobid is not null then
        perform cron.unschedule(existing_jobid);
    end if;
end;
$$;

-- The function URL is parameterised via the SUPABASE_URL config the
-- service-role connection has access to. The validator function reads
-- the service-role key itself from Deno.env, so the only thing pg_cron
-- ships is the trigger.
select cron.schedule(
    'm07_attachment_validate',
    '0 4 * * *',
    $$
        select net.http_post(
            url := current_setting('app.settings.supabase_url') || '/functions/v1/attachments-validate',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
            ),
            body := '{}'::jsonb
        );
    $$
);
