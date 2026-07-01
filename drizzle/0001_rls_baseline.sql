-- ============================================================================
-- RLS BASELINE — the unbypassable backstop (decisions doc §4)
-- ----------------------------------------------------------------------------
-- Model: app-layer permission checks are PRIMARY; RLS is the backstop so a
-- forgotten app-layer check can't become a breach (this app touches live ad
-- spend with external freelancers in the access list).
--
-- IMPORTANT — for RLS to actually bite, data must be read/written over a
-- Supabase-authenticated connection (the `authenticated` Postgres role, i.e.
-- PostgREST or Drizzle with the user's JWT + `set local role authenticated`).
-- A plain Drizzle connection using the service/owner role BYPASSES RLS by
-- design. The Meta sync worker is intended to run as the service role.
-- See the project README "Enforcement model" for how the web app threads the
-- user JWT through. This file encodes the policies regardless.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (resolve the app user + permissions from the Supabase JWT)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select u.id
  from public.users u
  where u.email = (auth.jwt() ->> 'email')
    and u.archived_at is null
    and u.role_id is not null
  limit 1
$$;

create or replace function public.is_valid_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.current_user_id() is not null
$$;

create or replace function public.has_perm(perm text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select case perm
      when 'upload' then r.perm_upload
      when 'link'   then r.perm_link
      when 'unlink' then r.perm_unlink
      when 'log'    then r.perm_log
      when 'master' then r.perm_master
      when 'access' then r.perm_access
      else false
    end
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.email = (auth.jwt() ->> 'email')
      and u.archived_at is null
      and r.archived_at is null
    limit 1
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every public table
-- ---------------------------------------------------------------------------
alter table public.roles              enable row level security;
alter table public.users              enable row level security;
alter table public.personas           enable row level security;
alter table public.angles             enable row level security;
alter table public.angle_personas     enable row level security;
alter table public.types              enable row level security;
alter table public.subtypes           enable row level security;
alter table public.awareness_stages   enable row level security;
alter table public.hook_types         enable row level security;
alter table public.creatives          enable row level security;
alter table public.creative_personas  enable row level security;
alter table public.creative_files     enable row level security;
alter table public.ad_activations     enable row level security;
alter table public.ad_metrics         enable row level security;
alter table public.ad_range_metrics   enable row level security;
alter table public.ad_decision_log    enable row level security;
alter table public.sync_runs          enable row level security;

-- ---------------------------------------------------------------------------
-- READ: any valid (non-archived, role-assigned) user reads everything.
-- Viewer included — decisions §5 "#6: sees all" (full read incl. decision log).
-- ---------------------------------------------------------------------------
create policy read_all_personas          on public.personas          for select to authenticated using (public.is_valid_user());
create policy read_all_angles            on public.angles            for select to authenticated using (public.is_valid_user());
create policy read_all_angle_personas    on public.angle_personas    for select to authenticated using (public.is_valid_user());
create policy read_all_types             on public.types             for select to authenticated using (public.is_valid_user());
create policy read_all_subtypes          on public.subtypes          for select to authenticated using (public.is_valid_user());
create policy read_all_awareness         on public.awareness_stages  for select to authenticated using (public.is_valid_user());
create policy read_all_hooks             on public.hook_types        for select to authenticated using (public.is_valid_user());
create policy read_all_creatives         on public.creatives         for select to authenticated using (public.is_valid_user());
create policy read_all_creative_personas on public.creative_personas for select to authenticated using (public.is_valid_user());
create policy read_all_creative_files    on public.creative_files    for select to authenticated using (public.is_valid_user());
create policy read_all_ad_activations    on public.ad_activations    for select to authenticated using (public.is_valid_user());
create policy read_all_ad_metrics        on public.ad_metrics        for select to authenticated using (public.is_valid_user());
create policy read_all_ad_range_metrics  on public.ad_range_metrics  for select to authenticated using (public.is_valid_user());
create policy read_all_ad_decision_log   on public.ad_decision_log   for select to authenticated using (public.is_valid_user());

-- users/roles: roles readable by valid users (drives UI gating); users readable
-- by Access managers, plus your own row (so the app can resolve your role).
create policy read_roles      on public.roles for select to authenticated using (public.is_valid_user());
create policy read_users      on public.users for select to authenticated
  using (public.has_perm('access') or email = (auth.jwt() ->> 'email'));
create policy read_sync_runs  on public.sync_runs for select to authenticated using (public.has_perm('master'));

-- ---------------------------------------------------------------------------
-- WRITE: gated by the six permissions.
-- ---------------------------------------------------------------------------
-- master → all taxonomy + sync_runs
create policy write_personas        on public.personas          for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_angles          on public.angles            for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_angle_personas  on public.angle_personas    for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_types           on public.types             for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_subtypes        on public.subtypes          for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_awareness       on public.awareness_stages  for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_hooks           on public.hook_types        for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));
create policy write_sync_runs       on public.sync_runs         for all to authenticated using (public.has_perm('master')) with check (public.has_perm('master'));

-- upload → creatives + their files + persona links
create policy write_creatives          on public.creatives          for all to authenticated using (public.has_perm('upload')) with check (public.has_perm('upload'));
create policy write_creative_files     on public.creative_files     for all to authenticated using (public.has_perm('upload')) with check (public.has_perm('upload'));
create policy write_creative_personas  on public.creative_personas  for all to authenticated using (public.has_perm('upload')) with check (public.has_perm('upload'));

-- link → insert activation; unlink → delete activation. (Status/metric writes are
-- the worker's job under the service role, which bypasses RLS.)
create policy link_ad_activation    on public.ad_activations for insert to authenticated with check (public.has_perm('link'));
create policy unlink_ad_activation  on public.ad_activations for delete to authenticated using (public.has_perm('unlink'));

-- log → append decision-log entries (authored as yourself)
create policy log_decision on public.ad_decision_log for insert to authenticated
  with check (public.has_perm('log') and author_id = public.current_user_id());

-- access → manage users + roles
create policy manage_users on public.users for all to authenticated using (public.has_perm('access')) with check (public.has_perm('access'));
create policy manage_roles on public.roles for all to authenticated using (public.has_perm('access')) with check (public.has_perm('access'));