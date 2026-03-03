create unique index if not exists overlay_refresh_tokens_user_id_device_id_uidx
  on public.overlay_refresh_tokens(user_id, device_id);

notify pgrst, 'reload schema';
