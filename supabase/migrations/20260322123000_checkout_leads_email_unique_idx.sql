do $$
begin
  if not exists (
    select 1
    from pg_index idx
    join pg_class tbl on tbl.oid = idx.indrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    join pg_attribute attr on attr.attrelid = tbl.oid and attr.attnum = idx.indkey[0]
    where ns.nspname = 'public'
      and tbl.relname = 'checkout_leads'
      and idx.indisunique
      and idx.indnatts = 1
      and attr.attname = 'email'
      and not attr.attisdropped
  ) then
    execute 'create unique index checkout_leads_email_unique_idx on public.checkout_leads (email)';
  end if;
end
$$;
