-- M15 — RLS sanity check for the ai_keys table. Mirrors the M09
-- ai-tables suite: two synthetic users, verify stamp-owner +
-- cross-tenant blindness.

begin;

create extension if not exists pgtap;

create or replace function public.uuid_to_jwt_role_ai_keys(uid uuid) returns void
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
    ('aa111111-1111-1111-1111-111111111111', 'a@aikeys.example', 'authenticated', 'authenticated'),
    ('bb222222-2222-2222-2222-222222222222', 'b@aikeys.example', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Seed user A's row at top level (superuser bypass) so the cross-tenant
-- visibility / mutate tests have something to react to regardless of
-- the order in which runtests() invokes the test functions.
insert into public.ai_keys (owner_id, provider, encrypted_secret)
values ('aa111111-1111-1111-1111-111111111111', 'ANTHROPIC', null)
on conflict (owner_id, provider) do nothing;

create or replace function public.test_ai_keys_stamp_owner() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_ai_keys('aa111111-1111-1111-1111-111111111111');
    -- OPENAI keeps this test independent of the seeded ANTHROPIC row.
    insert into public.ai_keys (provider) values ('OPENAI');
    return next is(
        (select count(*)::int from public.ai_keys
            where owner_id = 'aa111111-1111-1111-1111-111111111111' and provider = 'OPENAI'),
        1,
        'ai_keys: insert stamped owner_id from auth.uid()');
end;
$$;

create or replace function public.test_ai_keys_cross_tenant_blind() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_ai_keys('bb222222-2222-2222-2222-222222222222');
    return next is(
        (select count(*)::int from public.ai_keys),
        0,
        'user B sees no ai_keys rows from user A');
end;
$$;

create or replace function public.test_ai_keys_cross_tenant_cannot_mutate() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role_ai_keys('bb222222-2222-2222-2222-222222222222');
    update public.ai_keys set encrypted_secret = '\x00'::bytea
        where owner_id = 'aa111111-1111-1111-1111-111111111111';
    perform public.uuid_to_jwt_role_ai_keys('aa111111-1111-1111-1111-111111111111');
    return next is(
        (select count(*)::int from public.ai_keys
            where owner_id = 'aa111111-1111-1111-1111-111111111111'
              and encrypted_secret is null),
        1,
        'user B UPDATE of user A row affected zero rows');
end;
$$;

select * from runtests('public'::name, '^test_ai_keys_'::text);

rollback;
