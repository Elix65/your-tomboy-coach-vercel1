-- Optional legacy backfill: if messages had thread_id metadata, split into stable conversations per user/thread.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'thread_id'
  ) then
    insert into public.conversations (id, user_id, is_default)
    select distinct
      (
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 1, 8) || '-' ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 9, 4) || '-' ||
        '4' || substr(md5(m.user_id::text || ':' || m.thread_id::text), 14, 3) || '-' ||
        substr('89ab', (get_byte(decode(substr(md5(m.user_id::text || ':' || m.thread_id::text), 17, 2), 'hex'), 0) % 4) + 1, 1) ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 19, 3) || '-' ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 22, 12)
      )::uuid as id,
      m.user_id,
      false
    from public.messages m
    where m.user_id is not null
      and m.thread_id is not null
      and m.conversation_id is null
    on conflict (id) do nothing;

    update public.messages m
    set conversation_id = (
      (
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 1, 8) || '-' ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 9, 4) || '-' ||
        '4' || substr(md5(m.user_id::text || ':' || m.thread_id::text), 14, 3) || '-' ||
        substr('89ab', (get_byte(decode(substr(md5(m.user_id::text || ':' || m.thread_id::text), 17, 2), 'hex'), 0) % 4) + 1, 1) ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 19, 3) || '-' ||
        substr(md5(m.user_id::text || ':' || m.thread_id::text), 22, 12)
      )::uuid
    )
    where m.user_id is not null
      and m.thread_id is not null
      and m.conversation_id is null;
  end if;
end $$;
