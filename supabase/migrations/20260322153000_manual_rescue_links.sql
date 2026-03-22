alter table if exists public.checkout_leads
  add column if not exists manually_verified_at timestamptz,
  add column if not exists manually_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_verification_note text,
  add column if not exists rescue_link_generated_at timestamptz;

alter table if exists public.activation_tokens
  drop constraint if exists activation_tokens_purpose_check;

alter table if exists public.activation_tokens
  add constraint activation_tokens_purpose_check
  check (purpose in ('post_payment_activation', 'manual_rescue'));

create index if not exists activation_tokens_purpose_email_idx
  on public.activation_tokens (purpose, lower(email), created_at desc);
