alter table public.arrival_requests
  add column if not exists internal_note text;
