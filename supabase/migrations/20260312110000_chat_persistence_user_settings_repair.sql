-- Repair migration: conversations + messages FK wiring + user_settings compatibility columns.
create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists conversations_one_default_per_user_idx
  on public.conversations (user_id)
  where is_default = true;

alter table public.messages
  add column if not exists conversation_id uuid;

alter table public.messages
  add column if not exists created_at timestamptz not null default timezone('utc', now());

insert into public.conversations (user_id, is_default)
select distinct m.user_id, true
from public.messages m
where m.user_id is not null
on conflict (user_id) where is_default = true do nothing;

update public.messages m
set conversation_id = c.id
from public.conversations c
where m.user_id = c.user_id
  and c.is_default = true
  and m.conversation_id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'conversation_id'
      and is_nullable = 'YES'
  ) and not exists (
    select 1
    from public.messages
    where conversation_id is null
  ) then
    execute 'alter table public.messages alter column conversation_id set not null';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_fk'
  ) then
    alter table public.messages
      add constraint messages_conversation_fk
      foreign key (conversation_id)
      references public.conversations(id)
      on delete cascade;
  end if;
end
$$;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.user_settings
  add column if not exists active_skin_id uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists timezone text,
  add column if not exists offset_minutes int,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_seen_local_hour int,
  add column if not exists last_seen_bucket text,
  add column if not exists last_time_comment_at timestamptz,
  add column if not exists last_time_comment_bucket text,
  add column if not exists last_session_id text,
  add column if not exists personalize_by_time boolean not null default true,
  add column if not exists last_hello_nudge_at timestamptz,
  add column if not exists last_rest_nudge_at timestamptz,
  add column if not exists last_strong_rest_nudge_at timestamptz,
  add column if not exists last_tomorrow_followup_at timestamptz,
  add column if not exists voice_enabled boolean not null default false;

-- Trigger PostgREST/Supabase schema cache refresh after DDL.
notify pgrst, 'reload schema';
