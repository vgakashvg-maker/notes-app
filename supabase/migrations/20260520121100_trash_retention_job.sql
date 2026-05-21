-- M04 — Trash retention.
--
-- Schedule a daily DELETE of trashed notes older than 30 days. Lives in its
-- own migration because pg_cron requires the cron schema to exist (which is
-- enabled at the project level by Supabase) and we want the schedule to be
-- separately re-runnable when we tune the cadence.

create extension if not exists pg_cron;

-- Idempotent unschedule + re-schedule so re-running the migration doesn't
-- pile up duplicates. cron.unschedule raises if the job doesn't exist, so
-- guard with a SELECT first.
do $$
declare
    existing_jobid bigint;
begin
    select jobid into existing_jobid from cron.job where jobname = 'm04_trash_retention';
    if existing_jobid is not null then
        perform cron.unschedule(existing_jobid);
    end if;
end;
$$;

-- 03:00 UTC every day, per data-model.md §Scheduled jobs.
select cron.schedule(
    'm04_trash_retention',
    '0 3 * * *',
    $$
        delete from public.notes
        where is_trashed = true
          and trashed_at is not null
          and trashed_at < now() - interval '30 days'
    $$
);
