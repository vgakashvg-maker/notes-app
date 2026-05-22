-- M11 — RLS sanity check for the reminders table.

begin;

create extension if not exists pgtap;

create or replace function public.uuid_to_jwt_role_rem(uid uuid) returns void
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
    ('11111111-2222-4333-8444-555555555555', 'a@rem.example', 'authenticated', 'authenticated'),
    ('22222222-2222-4333-8444-555555555555', 'b@rem.example', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Seed a reminder for user A at top level so cross-tenant tests have a
-- target regardless of test order.
insert into public.reminders (id, owner_id, fire_at, title)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaae11',
    '11111111-2222-4333-8444-555555555555',
    '2026-05-23T09:00:00Z',
    'A morning standup'
)
on conflict (id) do nothing;

create or replace function public.test_reminders_stamp_owner() returns setof text
language plpgsql as $$
declare
    new_id uuid;
begin
    perform public.uuid_to_jwt_role_rem('11111111-2222-4333-8444-555555555555');
    insert into public.reminders (fire_at, title)
    values ('2026-05-23T10:00:00Z', 'A coffee')
    returning id into new_id;
    return next is(
        (select owner_id from public.reminders where id = new_id),
        '11111111-2222-4333-8444-555555555555'::uuid,
        'reminders: insert stamped owner_id from auth.uid()');
end;
$$;

create or replace function public.test_reminders_cross_tenant_blind() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_rem('22222222-2222-4333-8444-555555555555');
    return next is(
        (select count(*)::int from public.reminders),
        0,
        'user B sees no reminders from user A');
end;
$$;

create or replace function public.test_reminders_cross_tenant_cannot_mutate() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_rem('22222222-2222-4333-8444-555555555555');
    update public.reminders set title = 'pwned'
        where owner_id = '11111111-2222-4333-8444-555555555555';
    perform public.uuid_to_jwt_role_rem('11111111-2222-4333-8444-555555555555');
    return next is(
        (select count(*)::int from public.reminders
            where owner_id = '11111111-2222-4333-8444-555555555555'
              and title = 'pwned'),
        0,
        'user B UPDATE of user A reminder affected zero rows');
end;
$$;

select * from runtests('public'::name, '^test_reminders_'::text);

rollback;
