create table if not exists public.overlay_nudge_settings (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  enabled boolean not null default true,
  interval_minutes integer not null default 20,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists overlay_nudge_settings_user_id_idx on public.overlay_nudge_settings(user_id);
create index if not exists overlay_nudge_settings_device_id_idx on public.overlay_nudge_settings(device_id);

create or replace function public.touch_overlay_nudge_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_overlay_nudge_settings_updated_at on public.overlay_nudge_settings;
create trigger trg_overlay_nudge_settings_updated_at
before update on public.overlay_nudge_settings
for each row execute function public.touch_overlay_nudge_settings_updated_at();
