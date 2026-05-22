-- M04 — RLS multi-tenant safety net.
--
-- Run via the Supabase CLI's `db query --file`: the tests are wrapped
-- in pgTAP test functions and discovered by runtests(), so all
-- per-assertion lines come back as rows in a single result set
-- (`supabase db query` only surfaces the last result set otherwise).
--
-- The whole script runs inside a transaction it then rolls back, so
-- it is safe to re-run against a live database.

begin;

create extension if not exists pgtap;

-- ----------------------------------------------------------------------------
-- Helper: switch the role + jwt claims to simulate user N. Used by both
-- this file and rls_embeddings.test.sql.
-- ----------------------------------------------------------------------------

create or replace function public.uuid_to_jwt_role(uid uuid) returns void
language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims',
        json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Two synthetic auth users. Inserted at top-level (security definer
-- isn't required here because pgTAP runs as the connecting role,
-- which has the admin privileges the test functions need).
-- ----------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
    ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Seed user A's rows once, then verify behaviour from each user's POV
-- inside dedicated test functions.
-- ----------------------------------------------------------------------------

-- Seed runs as the connecting role (superuser bypass for RLS), so
-- the rows land with the explicit owner_ids. Each test function
-- switches to the relevant authenticated user via uuid_to_jwt_role
-- before checking visibility.
insert into public.notebooks (id, owner_id, name)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'A-Inbox')
on conflict (id) do nothing;

insert into public.tags (id, owner_id, name)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'a-tag')
on conflict (id) do nothing;

insert into public.notes (id, owner_id, notebook_id, title, body_json)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
    'A-Note',
    '{"type":"doc","content":[]}'::jsonb
)
on conflict (id) do nothing;

insert into public.note_tags (note_id, tag_id)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2')
on conflict (note_id, tag_id) do nothing;

-- ----------------------------------------------------------------------------
-- Tests
-- ----------------------------------------------------------------------------

create or replace function public.test_user_a_sees_own_rows() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next is((select count(*)::int from public.notes), 1, 'user A: sees own note');
    return next is((select count(*)::int from public.notebooks), 1, 'user A: sees own notebook');
    return next is((select count(*)::int from public.tags), 1, 'user A: sees own tag');
    return next is((select count(*)::int from public.note_tags), 1, 'user A: sees own note_tags row');
end;
$$;

create or replace function public.test_user_b_is_blind_to_user_a() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    return next is((select count(*)::int from public.notes), 0, 'user B: does NOT see user A''s notes');
    return next is((select count(*)::int from public.notebooks), 0, 'user B: does NOT see user A''s notebooks');
    return next is((select count(*)::int from public.tags), 0, 'user B: does NOT see user A''s tags');
    return next is((select count(*)::int from public.note_tags), 0, 'user B: does NOT see user A''s note_tags');
end;
$$;

create or replace function public.test_user_b_cannot_mutate_user_a() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    update public.notes set title = 'pwned' where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3';
    return next is((select count(*)::int from public.notes where title = 'pwned'), 0,
        'user B: UPDATE of user A''s note affects zero rows');
    delete from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3';
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next is((select count(*)::int from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3'), 1,
        'user A: own note survives a hostile DELETE attempt by user B');
    return next is((select title from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3'), 'A-Note',
        'user A: own note title was not modified by user B');
end;
$$;

create or replace function public.test_cross_owner_note_tags_rejected() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    insert into public.tags (id, owner_id, name)
    values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'b-tag')
    on conflict (id) do nothing;

    -- The cross-owner insert raises either "different owners" (when
    -- RLS lets the trigger see the foreign tag) or "unknown tag" (when
    -- RLS hides the row from user A entirely). Both are correct
    -- rejections of the cross-tenant attempt. The trigger guarantee
    -- is "the insert never lands"; the exact message is a corollary
    -- of whether RLS or the trigger fires first.
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next throws_ok(
        'insert into public.note_tags (note_id, tag_id) values (''aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3'', ''bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1'')',
        null,
        null,
        'cross-owner note_tags insert is rejected (RLS + trigger)'
    );
end;
$$;

create or replace function public.test_notes_stamp_owner() returns setof text
language plpgsql as $$
declare
    new_id uuid;
    stamped_owner uuid;
begin
    -- Authenticated as user B; insert a note without owner_id.
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    insert into public.notes (title, body_json)
    values ('stamp-test', '{"type":"doc","content":[]}'::jsonb)
    returning id into new_id;
    return next isnt(new_id, null, 'notes: insert without owner_id succeeds');

    select owner_id into stamped_owner from public.notes where id = new_id;
    return next is(stamped_owner, '22222222-2222-2222-2222-222222222222'::uuid,
        'notes: trigger stamped owner_id from auth.uid()');

    -- Switch to user A — RLS must hide user B's freshly-stamped row.
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next is((select count(*)::int from public.notes where id = new_id), 0,
        'notes: user A cannot see user B''s stamped row (RLS)');
end;
$$;

-- ----------------------------------------------------------------------------
-- Run everything and print TAP. runtests returns one row per
-- assertion (plus the plan + summary lines).
-- ----------------------------------------------------------------------------

select * from runtests('public'::name, '^test_'::text);

rollback;
