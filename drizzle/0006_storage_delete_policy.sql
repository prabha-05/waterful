-- Storage DELETE policy (2026-07): deleteCreative removes a mistaken upload's
-- files from the `creatives` bucket. Gated on `upload` like insert/update.
-- Wrapped defensively: the local dev Postgres has no `storage` schema — skip there.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "creatives_delete" on storage.objects';
    execute 'create policy "creatives_delete" on storage.objects
      for delete to authenticated
      using (bucket_id = ''creatives'' and public.has_perm(''upload''))';
  end if;
end $$;
