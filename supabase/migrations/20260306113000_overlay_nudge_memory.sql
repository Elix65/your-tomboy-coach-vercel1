alter table public.overlay_nudge_settings
  add column if not exists last_nudge_bucket text,
  add column if not exists last_nudge_message text;
