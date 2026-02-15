alter table public.user_settings
  add column if not exists last_hello_nudge_at timestamptz,
  add column if not exists last_rest_nudge_at timestamptz,
  add column if not exists last_strong_rest_nudge_at timestamptz,
  add column if not exists last_tomorrow_followup_at timestamptz;
