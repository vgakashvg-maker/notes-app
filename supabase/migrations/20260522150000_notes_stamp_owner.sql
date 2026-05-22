-- M13 hotfix — stamp public.notes.owner_id from auth.uid() on insert.
--
-- M04 (notes_core.sql) left this off: every other owner-bearing table
-- (note_tags, dangling_attachments, note_embeddings, ai_conversations,
-- ai_messages) stamps owner_id from auth.uid() or a parent row in a
-- BEFORE-INSERT trigger, but `notes` itself relied on the adapter to
-- supply owner_id explicitly. M13's web client sends only {title,
-- body_json}, so inserts were failing with 23502 (NOT NULL violation).
--
-- This migration adds the missing trigger, mirroring the
-- ai_conversations_stamp_owner pattern from ai_tables.sql.
create or replace function public.notes_stamp_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.owner_id is null then
        new.owner_id := auth.uid();
    end if;
    if new.owner_id is null then
        raise exception 'notes: caller has no auth.uid()';
    end if;
    return new;
end;
$$;

drop trigger if exists notes_stamp_owner_trigger on public.notes;
create trigger notes_stamp_owner_trigger
before insert on public.notes
for each row execute function public.notes_stamp_owner();

comment on function public.notes_stamp_owner() is
    'M13 hotfix: stamps notes.owner_id from auth.uid() when the client omits it.';
