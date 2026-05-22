-- M08 — RLS sanity check for events_mirror + note_event_links.
--
-- Mirrors the M09 ai-tables suite: two synthetic users, verify
-- stamp-owner, cross-tenant blind, cross-tenant cannot mutate, plus the
-- cross-owner reject for note_event_links.

begin;

create extension if not exists pgtap;

create or replace function public.uuid_to_jwt_role_em(uid uuid) returns void
language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims',
        json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
end;
$$;

insert into auth.users (id, email, aud, role)
values
    ('e1111111-1111-1111-1111-111111111111', 'a@em.example', 'authenticated', 'authenticated'),
    ('e2222222-2222-2222-2222-222222222222', 'b@em.example', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Seed user A's event at top level (superuser bypass) so cross-tenant
-- tests have a target. start_at + end_at must satisfy the check.
insert into public.events_mirror (
    id, owner_id, provider, external_event_id, calendar_id, title, start_at, end_at
)
values (
    'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeee1',
    'e1111111-1111-1111-1111-111111111111',
    'GOOGLE_CALENDAR',
    'gcal-A-event-1',
    'primary',
    'A standup',
    '2026-05-22T09:00:00Z',
    '2026-05-22T09:30:00Z'
)
on conflict (owner_id, provider, external_event_id) do nothing;

-- Seed a note for user A so the cross-owner reject test has both sides.
insert into public.notes (id, owner_id, title, body_json)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaee1',
    'e1111111-1111-1111-1111-111111111111',
    'A note for events',
    '{"type":"doc","content":[]}'::jsonb
)
on conflict (id) do nothing;

create or replace function public.test_em_stamp_owner() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_em('e1111111-1111-1111-1111-111111111111');
    insert into public.events_mirror (
        provider, external_event_id, calendar_id, title, start_at, end_at
    )
    values (
        'GOOGLE_CALENDAR',
        'gcal-A-event-2',
        'primary',
        'A coffee',
        '2026-05-22T10:00:00Z',
        '2026-05-22T10:30:00Z'
    );
    return next is(
        (select count(*)::int from public.events_mirror
            where owner_id = 'e1111111-1111-1111-1111-111111111111'
              and external_event_id = 'gcal-A-event-2'),
        1,
        'events_mirror: insert stamped owner_id from auth.uid()');
end;
$$;

create or replace function public.test_em_cross_tenant_blind() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_em('e2222222-2222-2222-2222-222222222222');
    return next is(
        (select count(*)::int from public.events_mirror),
        0,
        'user B sees no events_mirror rows from user A');
end;
$$;

create or replace function public.test_em_cross_tenant_cannot_mutate() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_em('e2222222-2222-2222-2222-222222222222');
    update public.events_mirror set title = 'pwned'
        where owner_id = 'e1111111-1111-1111-1111-111111111111';
    perform public.uuid_to_jwt_role_em('e1111111-1111-1111-1111-111111111111');
    return next is(
        (select count(*)::int from public.events_mirror
            where owner_id = 'e1111111-1111-1111-1111-111111111111' and title = 'pwned'),
        0,
        'user B UPDATE of user A row affected zero rows');
end;
$$;

create or replace function public.test_note_event_links_cross_owner_rejected() returns setof text
language plpgsql as $$
declare
    other_event_id uuid;
begin
    -- Seed an event for user B at top level (superuser bypass).
    insert into public.events_mirror (
        owner_id, provider, external_event_id, calendar_id, title, start_at, end_at
    )
    values (
        'e2222222-2222-2222-2222-222222222222',
        'GOOGLE_CALENDAR',
        'gcal-B-event-1',
        'primary',
        'B sync',
        '2026-05-22T11:00:00Z',
        '2026-05-22T11:30:00Z'
    )
    on conflict (owner_id, provider, external_event_id) do nothing
    returning id into other_event_id;

    if other_event_id is null then
        select id into other_event_id from public.events_mirror
            where owner_id = 'e2222222-2222-2222-2222-222222222222'
              and external_event_id = 'gcal-B-event-1';
    end if;

    perform public.uuid_to_jwt_role_em('e1111111-1111-1111-1111-111111111111');
    return next throws_ok(
        format(
            'insert into public.note_event_links (note_id, event_mirror_id) ' ||
            'values (%L, %L)',
            'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaee1', other_event_id
        ),
        null,
        null,
        'note_event_links cross-owner insert is rejected'
    );
end;
$$;

select * from runtests('public'::name, '^test_em_|^test_note_event_links_'::text);

rollback;
