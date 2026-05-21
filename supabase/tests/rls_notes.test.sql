-- M04 — RLS multi-tenant safety net.
--
-- Run via: supabase test db (uses pg_prove under the hood).
-- Verifies that authenticated user A cannot read, update, or delete user B's
-- notes/notebooks/tags. This is THE test that protects every future user.

begin;

select plan(12);

-- ----------------------------------------------------------------------------
-- Set-up: two synthetic auth users.
-- ----------------------------------------------------------------------------

create or replace function tests.uuid_to_jwt_role(uid uuid) returns text
language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    return 'authenticated';
end;
$$;

insert into auth.users (id, email, aud, role)
values
    ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- As user A: insert a notebook + a note + a tag + a note_tags row.
-- ----------------------------------------------------------------------------

select tests.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');

insert into public.notebooks (id, owner_id, name)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'A-Inbox');

insert into public.tags (id, owner_id, name)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'a-tag');

insert into public.notes (id, owner_id, notebook_id, title, body_json)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
    'A-Note',
    '{"type":"doc","content":[]}'::jsonb
);

insert into public.note_tags (note_id, tag_id)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2');

select is(
    (select count(*)::int from public.notes),
    1,
    'as user A: sees own note'
);
select is(
    (select count(*)::int from public.notebooks),
    1,
    'as user A: sees own notebook'
);
select is(
    (select count(*)::int from public.tags),
    1,
    'as user A: sees own tag'
);
select is(
    (select count(*)::int from public.note_tags),
    1,
    'as user A: sees own note_tags row'
);

-- ----------------------------------------------------------------------------
-- As user B: no rows from A are visible.
-- ----------------------------------------------------------------------------

select tests.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');

select is(
    (select count(*)::int from public.notes),
    0,
    'as user B: does NOT see user A''s notes'
);
select is(
    (select count(*)::int from public.notebooks),
    0,
    'as user B: does NOT see user A''s notebooks'
);
select is(
    (select count(*)::int from public.tags),
    0,
    'as user B: does NOT see user A''s tags'
);
select is(
    (select count(*)::int from public.note_tags),
    0,
    'as user B: does NOT see user A''s note_tags'
);

-- UPDATE / DELETE attempts hit zero rows under RLS.
update public.notes set title = 'pwned' where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3';
select is(
    (select count(*)::int from public.notes where title = 'pwned'),
    0,
    'as user B: UPDATE of user A''s note affects zero rows'
);

delete from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3';

-- ----------------------------------------------------------------------------
-- Back as user A: the note still exists and was not modified.
-- ----------------------------------------------------------------------------

select tests.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');

select is(
    (select count(*)::int from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3'),
    1,
    'as user A: own note survives a hostile DELETE attempt by user B'
);
select is(
    (select title from public.notes where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3'),
    'A-Note',
    'as user A: own note title was not modified by user B'
);

-- ----------------------------------------------------------------------------
-- note_tags integrity: cross-owner tag is rejected by the stamping trigger.
-- ----------------------------------------------------------------------------

-- User A tries to tag their note with a tag owned by user B — should fail.
select tests.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');

insert into public.tags (id, owner_id, name)
values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'b-tag');

select tests.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');

select throws_like(
    $$insert into public.note_tags (note_id, tag_id) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1')$$,
    '%different owners%',
    'cross-owner note_tags insert is rejected by the stamp_owner trigger'
);

select * from finish();

rollback;
