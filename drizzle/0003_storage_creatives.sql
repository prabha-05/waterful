-- ============================================================================
-- Storage bucket + policies for creative files (decisions §7 #5, §10).
-- Files (MP4/MOV, PNG/JPG) live in Supabase Storage; references in creative_files.
-- Storage uses the user's JWT (authenticated role) so these RLS policies DO bite.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('creatives', 'creatives', false)
on conflict (id) do nothing;

-- Any valid user can read creative files (Viewer included — §5 "sees all").
drop policy if exists "creatives_read" on storage.objects;
create policy "creatives_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'creatives' and public.is_valid_user());

-- Only users with `upload` can add files (Content/Admin) — matches creative writes.
drop policy if exists "creatives_insert" on storage.objects;
create policy "creatives_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'creatives' and public.has_perm('upload'));

drop policy if exists "creatives_update" on storage.objects;
create policy "creatives_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'creatives' and public.has_perm('upload'));
