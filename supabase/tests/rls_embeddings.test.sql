-- M10 — RLS + namespace isolation for note_embeddings.
--
-- Same shape as rls_notes.test.sql: wrap each assertion in a
-- runtests-discoverable function so the whole suite is one result set.

begin;

create extension if not exists pgtap;

create or replace function public.uuid_to_jwt_role(uid uuid) returns void
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
    ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Seed runs as the connecting role (RLS bypass). The note carries an
-- explicit owner_id; the embedding is inserted WITHOUT owner_id so
-- the stamp_owner trigger has to fire.
insert into public.notes (id, owner_id, title, body_json)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaae1',
    '11111111-1111-1111-1111-111111111111',
    'A-Embed-Note',
    '{"type":"doc","content":[]}'::jsonb
)
on conflict (id) do nothing;

insert into public.note_embeddings (note_id, namespace, chunk_index, content, embedding)
values (
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaae1',
    'ollama:nomic-embed-text',
    0,
    'hello world',
    (array_fill(0.0::real, ARRAY[768]))::vector
)
on conflict (note_id, namespace, chunk_index) do nothing;

-- ----------------------------------------------------------------------------
-- Tests
-- ----------------------------------------------------------------------------

create or replace function public.test_stamp_owner_fires_on_insert() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next is(
        (select owner_id from public.note_embeddings where note_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaae1' limit 1),
        '11111111-1111-1111-1111-111111111111'::uuid,
        'stamp-owner trigger sets owner_id from the note'
    );
    return next is(
        (select count(*)::int from public.note_embeddings),
        1,
        'user A: sees own embedding'
    );
end;
$$;

create or replace function public.test_user_b_blind_to_user_a_embeddings() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    return next is(
        (select count(*)::int from public.note_embeddings),
        0,
        'user B: does NOT see user A''s embeddings'
    );
    update public.note_embeddings set content = 'pwned'
        where note_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaae1';
    return next is(
        (select count(*)::int from public.note_embeddings where content = 'pwned'),
        0,
        'user B: UPDATE of user A''s embedding affects zero rows'
    );
end;
$$;

create or replace function public.test_namespace_isolation() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    insert into public.note_embeddings (note_id, namespace, chunk_index, content, embedding)
    values (
        'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaae1',
        'ollama:other-model',
        0,
        'other namespace',
        (array_fill(0.0::real, ARRAY[768]))::vector
    );
    return next is(
        (select count(*)::int from public.note_embeddings),
        2,
        'two namespaces coexist for the same note + chunk_index'
    );
end;
$$;

create or replace function public.test_vector_search_user_scoped() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    return next is(
        (select count(*)::int from public.vector_search(
            (array_fill(0.0::real, ARRAY[768]))::vector,
            10,
            'ollama:nomic-embed-text',
            null,
            null,
            true
        )),
        1,
        'vector_search returns user A''s embedding for the matching namespace'
    );
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    return next is(
        (select count(*)::int from public.vector_search(
            (array_fill(0.0::real, ARRAY[768]))::vector,
            10,
            'ollama:nomic-embed-text',
            null,
            null,
            true
        )),
        0,
        'vector_search returns zero rows for user B'
    );
end;
$$;

select * from runtests('public'::name, '^test_'::text);

rollback;
