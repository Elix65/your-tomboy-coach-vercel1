create extension if not exists pgcrypto;

create table if not exists public.arrival_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  desired_experience text not null,
  desired_moments text not null,
  optional_note text,
  status text not null default 'requested' check (
    status in (
      'requested',
      'approved',
      'invited',
      'payment_pending',
      'paid',
      'account_enabled',
      'active'
    )
  ),
  invite_token text not null default encode(gen_random_bytes(24), 'hex'),
  approved_at timestamptz,
  invited_at timestamptz,
  account_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists arrival_requests_email_idx
  on public.arrival_requests (lower(email));

create unique index if not exists arrival_requests_invite_token_idx
  on public.arrival_requests (invite_token);

create index if not exists arrival_requests_status_idx
  on public.arrival_requests (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_arrival_requests_updated_at on public.arrival_requests;
create trigger trg_arrival_requests_updated_at
before update on public.arrival_requests
for each row
execute function public.set_updated_at();
