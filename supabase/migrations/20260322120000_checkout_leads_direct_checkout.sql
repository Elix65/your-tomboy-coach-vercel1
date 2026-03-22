create table if not exists public.checkout_leads (
  email text primary key,
  country_code text,
  payment_provider text not null check (payment_provider in ('mercadopago', 'paypal')),
  payment_url text not null,
  source text not null default 'public_direct_checkout',
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

drop trigger if exists trg_checkout_leads_updated_at on public.checkout_leads;
create trigger trg_checkout_leads_updated_at
before update on public.checkout_leads
for each row
execute function public.set_updated_at();
