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

create index if not exists overlay_links_user_id_idx on public.overlay_links(user_id);
create index if not exists overlay_links_expires_at_idx on public.overlay_links(expires_at);

create table if not exists public.overlay_refresh_tokens (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  device_id text,
  device_name text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists overlay_refresh_tokens_user_id_idx on public.overlay_refresh_tokens(user_id);
create index if not exists overlay_refresh_tokens_device_id_idx on public.overlay_refresh_tokens(device_id);
create index if not exists overlay_refresh_tokens_expires_at_idx on public.overlay_refresh_tokens(expires_at);
