-- User settings for local-time personalization + compatibility with active skin state.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_skin_id uuid null,
  timezone text,
  offset_minutes int,
  last_seen_at timestamptz,
  last_seen_local_hour int,
  last_seen_bucket text,
  last_time_comment_at timestamptz,
  last_time_comment_bucket text,
  last_session_id text,
  personalize_by_time boolean not null default true
);

alter table public.user_settings
  add column if not exists timezone text,
  add column if not exists offset_minutes int,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_seen_local_hour int,
  add column if not exists last_seen_bucket text,
  add column if not exists last_time_comment_at timestamptz,
  add column if not exists last_time_comment_bucket text,
  add column if not exists last_session_id text,
  add column if not exists personalize_by_time boolean not null default true,
  add column if not exists active_skin_id uuid null;

alter table public.user_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_settings'
      and policyname = 'Users can select own settings'
  ) then
    create policy "Users can select own settings"
      on public.user_settings
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_settings'
      and policyname = 'Users can insert own settings'
  ) then
    create policy "Users can insert own settings"
      on public.user_settings
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_settings'
      and policyname = 'Users can update own settings'
  ) then
    create policy "Users can update own settings"
      on public.user_settings
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
