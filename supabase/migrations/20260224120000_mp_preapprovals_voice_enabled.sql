alter table public.user_settings
  add column if not exists voice_enabled boolean not null default false;

create table if not exists public.mp_preapprovals (
  preapproval_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mp_preapprovals_updated_at on public.mp_preapprovals;
create trigger trg_mp_preapprovals_updated_at
before update on public.mp_preapprovals
for each row
execute function public.set_updated_at();
