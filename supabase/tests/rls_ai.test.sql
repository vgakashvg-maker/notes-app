-- M09 — RLS safety net for the four AI tables.
-- Same shape as rls_notes.test.sql + rls_embeddings.test.sql.

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

-- Seed user A's conversation + message + memory + usage row.
insert into public.ai_conversations (id, owner_id, title)
values ('cccccccc-cccc-4ccc-accc-ccccccccccc1' :: uuid, '11111111-1111-1111-1111-111111111111', 'A-Thread')
on conflict (id) do nothing;

insert into public.ai_messages (conversation_id, role, content)
values ('cccccccc-cccc-4ccc-accc-ccccccccccc1', 'user', 'hello')
on conflict do nothing;

insert into public.ai_memory (owner_id, fact, source)
values ('11111111-1111-1111-1111-111111111111', 'Prefers concise summaries', 'user')
on conflict do nothing;

insert into public.ai_usage_log (owner_id, provider, model, task, prompt_tokens, completion_tokens, cost_usd, latency_ms)
values ('11111111-1111-1111-1111-111111111111', 'OLLAMA', 'qwen2.5:7b', 'chat', 100, 50, 0, 200);

-- ----------------------------------------------------------------------------
-- Tests
-- ----------------------------------------------------------------------------

create or replace function public.test_ai_stamp_owner_on_conversation_insert() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    insert into public.ai_conversations (title) values ('Another') on conflict do nothing;
    return next is(
        (select count(*)::int from public.ai_conversations where title = 'Another'),
        1,
        'ai_conversations.owner_id is stamped from auth.uid() on insert'
    );
end;
$$;

create or replace function public.test_ai_messages_stamp_owner_from_conversation() returns setof text
language plpgsql as $$
declare
    msg_owner uuid;
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    select owner_id into msg_owner from public.ai_messages limit 1;
    return next is(
        msg_owner,
        '11111111-1111-1111-1111-111111111111'::uuid,
        'ai_messages.owner_id is stamped from parent conversation'
    );
end;
$$;

create or replace function public.test_user_b_blind_to_user_a_ai() returns setof text
language plpgsql as $$
begin
    perform public.uuid_to_jwt_role('22222222-2222-2222-2222-222222222222');
    return next is(
        (select count(*)::int from public.ai_conversations),
        0,
        'user B: does NOT see user A''s conversations'
    );
    return next is(
        (select count(*)::int from public.ai_messages),
        0,
        'user B: does NOT see user A''s messages'
    );
    return next is(
        (select count(*)::int from public.ai_memory),
        0,
        'user B: does NOT see user A''s memory'
    );
    return next is(
        (select count(*)::int from public.ai_usage_log),
        0,
        'user B: does NOT see user A''s usage log'
    );
end;
$$;

create or replace function public.test_ai_conversation_last_message_bumps() returns setof text
language plpgsql as $$
declare
    before_ts timestamptz;
    after_ts timestamptz;
begin
    perform public.uuid_to_jwt_role('11111111-1111-1111-1111-111111111111');
    select last_message_at into before_ts
    from public.ai_conversations where id = 'cccccccc-cccc-4ccc-accc-ccccccccccc1';
    perform pg_sleep(0.01);
    insert into public.ai_messages (conversation_id, role, content)
    values ('cccccccc-cccc-4ccc-accc-ccccccccccc1', 'assistant', 'bump');
    select last_message_at into after_ts
    from public.ai_conversations where id = 'cccccccc-cccc-4ccc-accc-ccccccccccc1';
    return next ok(after_ts > before_ts, 'last_message_at advances on new message');
end;
$$;

select * from runtests('public'::name, '^test_'::text);

rollback;
