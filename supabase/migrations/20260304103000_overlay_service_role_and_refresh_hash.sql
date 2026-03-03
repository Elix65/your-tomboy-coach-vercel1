alter table if exists public.overlay_refresh_tokens
  add column if not exists refresh_token_hash text;

update public.overlay_refresh_tokens
set refresh_token_hash = token_hash
where refresh_token_hash is null
  and token_hash is not null;

alter table public.overlay_refresh_tokens
  alter column refresh_token_hash set not null;

create unique index if not exists overlay_refresh_tokens_refresh_token_hash_idx
  on public.overlay_refresh_tokens(refresh_token_hash);

grant select, insert, update, delete on table public.overlay_links to service_role;
grant select, insert, update, delete on table public.overlay_refresh_tokens to service_role;
grant usage, select on sequence public.overlay_links_id_seq to service_role;
grant usage, select on sequence public.overlay_refresh_tokens_id_seq to service_role;

notify pgrst, 'reload schema';
