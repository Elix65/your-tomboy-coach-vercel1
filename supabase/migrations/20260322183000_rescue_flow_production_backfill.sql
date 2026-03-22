create extension if not exists pgcrypto;

alter table if exists public.checkout_leads
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  add column if not exists payment_reference text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists manually_verified_at timestamptz,
  add column if not exists manually_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_verification_note text,
  add column if not exists rescue_link_generated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_checkout_leads_updated_at on public.checkout_leads;
create trigger trg_checkout_leads_updated_at
before update on public.checkout_leads
for each row
execute function public.set_updated_at();

create table if not exists public.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  checkout_email text,
  checkout_provider text,
  checkout_reference text,
  purpose text not null default 'post_payment_activation',
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table if exists public.activation_tokens
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists checkout_email text,
  add column if not exists checkout_provider text,
  add column if not exists checkout_reference text,
  add column if not exists purpose text not null default 'post_payment_activation',
  add column if not exists used_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.activation_tokens
  drop constraint if exists activation_tokens_purpose_check;

alter table if exists public.activation_tokens
  add constraint activation_tokens_purpose_check
  check (purpose in ('post_payment_activation', 'manual_rescue'));

create index if not exists activation_tokens_email_idx
  on public.activation_tokens (lower(email), created_at desc);

create index if not exists activation_tokens_checkout_email_idx
  on public.activation_tokens (lower(checkout_email), created_at desc);

create index if not exists activation_tokens_expires_at_idx
  on public.activation_tokens (expires_at);

create index if not exists activation_tokens_purpose_email_idx
  on public.activation_tokens (purpose, lower(email), created_at desc);
