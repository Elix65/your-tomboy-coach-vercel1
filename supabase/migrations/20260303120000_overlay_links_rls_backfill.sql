-- Backfill-safe migration for pairing PRO links in case prior migration was skipped.
create table if not exists public.overlay_links (
  id bigserial primary key,
  code_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  device_id text,
  device_name text,
  created_at timestamptz not null default now()
);

alter table public.overlay_links
  add column if not exists code_hash text,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists device_id text,
  add column if not exists device_name text,
  add column if not exists created_at timestamptz not null default now();

alter table public.overlay_links
  alter column code_hash set not null,
  alter column user_id set not null,
  alter column expires_at set not null,
  alter column created_at set not null;

create unique index if not exists overlay_links_code_hash_idx on public.overlay_links(code_hash);
create index if not exists overlay_links_user_id_idx on public.overlay_links(user_id);
create index if not exists overlay_links_expires_at_idx on public.overlay_links(expires_at);

alter table public.overlay_links enable row level security;

grant select, insert, update on table public.overlay_links to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'overlay_links'
      and policyname = 'Users can insert own overlay links'
  ) then
    create policy "Users can insert own overlay links"
      on public.overlay_links
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'overlay_links'
      and policyname = 'Users can select own overlay links'
  ) then
    create policy "Users can select own overlay links"
      on public.overlay_links
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'overlay_links'
      and policyname = 'Users can update own overlay links'
  ) then
    create policy "Users can update own overlay links"
      on public.overlay_links
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
