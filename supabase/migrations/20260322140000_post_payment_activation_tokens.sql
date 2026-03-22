alter table if exists public.checkout_leads
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  add column if not exists payment_reference text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists activated_at timestamptz;

create table if not exists public.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  checkout_email text,
  checkout_provider text,
  checkout_reference text,
  purpose text not null default 'post_payment_activation' check (purpose in ('post_payment_activation')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists activation_tokens_email_idx
  on public.activation_tokens (lower(email), created_at desc);

create index if not exists activation_tokens_checkout_email_idx
  on public.activation_tokens (lower(checkout_email), created_at desc);

create index if not exists activation_tokens_expires_at_idx
  on public.activation_tokens (expires_at);
