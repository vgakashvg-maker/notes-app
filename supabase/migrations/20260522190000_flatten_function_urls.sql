-- Repoint baked-in Edge Function URLs to the flat-slug names the
-- Supabase CLI accepts (^[A-Za-z][A-Za-z0-9_-]*$ — no `/`).
--
-- The original M07 / M09 / M10 migrations baked `/functions/v1/<dir>/<sub>`
-- into a trigger function and two cron jobs that are already live on
-- notes-dev. This migration:
--   1. Re-creates `notes_enqueue_embedding` with `embeddings-index`.
--   2. Re-schedules `m07_attachment_validate` with `attachments-validate`.
--   3. Re-schedules `m09_daily_briefing` with `ai-briefing`.
--
-- The migration is idempotent: `cron.unschedule` only fires when the
-- old jobid exists.

create or replace function public.notes_enqueue_embedding() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    supabase_url text;
    service_key text;
begin
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
    if supabase_url is null or supabase_url = '' or service_key is null or service_key = '' then
        return new;
    end if;
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
        raise warning 'notes_enqueue_embedding: http_post failed: %', sqlerrm;
    end;
    return new;
end;
$$;

do $$
declare
    existing_jobid bigint;
begin
    select jobid into existing_jobid from cron.job where jobname = 'm07_attachment_validate';
    if existing_jobid is not null then perform cron.unschedule(existing_jobid); end if;
end;
$$;

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

do $$
declare
    existing_jobid bigint;
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
