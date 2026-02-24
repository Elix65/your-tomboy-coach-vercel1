create table if not exists public.mp_preapprovals (
  preapproval_id text primary key,
  user_id uuid not null,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mp_preapprovals_user_id_idx
  on public.mp_preapprovals(user_id);
