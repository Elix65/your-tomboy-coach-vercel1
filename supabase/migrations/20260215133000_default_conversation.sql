-- Default conversation per user + FK on messages
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

alter table public.messages
  alter column conversation_id set not null;

alter table public.messages
  add constraint if not exists messages_conversation_fk
  foreign key (conversation_id)
  references public.conversations(id)
  on delete cascade;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);
