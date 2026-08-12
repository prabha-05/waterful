-- Script Library — the stage BEFORE a creative exists (design bundle 2026-08-12 §0).
-- A writer drafts a script, it moves through review to approved, goes out to a
-- creator, and returns as an uploaded creative. creatives.script_id closes that loop.

-- 1) Pipeline stages. Order is the advance path:
--    draft | changes -> review -> approved -> creators -> received
do $$ begin
  create type script_stage as enum ('draft','review','changes','approved','creators','received');
exception when duplicate_object then null;
end $$;

-- 2) The eighth permission. The design bundle said seven and dropped `sync`,
--    but `sync` is live (it is how Performance refreshes before a call), so the
--    real model is eight: script, upload, link, unlink, log, sync, master, access.
alter table roles add column if not exists perm_script boolean not null default false;

create table if not exists scripts (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,          -- SCR-0001, human-quotable
  title       text        not null,
  hook_line   text        not null default '',
  body        text        not null default '',
  note_title  text,
  note_tone   text,
  angle_id    uuid references angles(id),
  persona_id  uuid references personas(id),         -- one persona per script
  type        text,                                 -- intended format, free text
  runtime     integer,                              -- seconds
  words       integer     not null default 0,
  version     integer     not null default 1,
  stage       script_stage not null default 'draft',
  writer_id   uuid        not null references users(id),
  creator_id  uuid        references users(id),     -- set when it goes to creators
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scripts_stage_idx  on scripts (stage);
create index if not exists scripts_writer_idx on scripts (writer_id);

-- Append-only: every transition and edit, so the history survives a role change.
create table if not exists script_activity (
  id        uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  text      text not null,
  actor_id  uuid not null references users(id),
  at        timestamptz not null default now()
);

create index if not exists script_activity_script_idx on script_activity (script_id, at desc);

-- 3) The seam. Null for anything uploaded directly, set when a creative is
--    uploaded against an approved script.
alter table creatives add column if not exists script_id uuid references scripts(id) on delete set null;
create index if not exists creatives_script_idx on creatives (script_id);

-- 4) Admin gets the new permission; Viewer stays locked all-off by definition.
update roles set perm_script = true where perm_access = true;

-- 5) Seed the Script Person role — non-system and editable, holding only `script`.
insert into roles (label, is_system, is_locked, perm_script)
select 'Script Person', false, false, true
where not exists (select 1 from roles where label = 'Script Person');

-- 6) RLS mirrors the other tables: readable by any user holding a valid role,
--    via the existing public.is_valid_user() helper. Writes go through server
--    actions on the service-role connection, which bypasses RLS by design.
--    Guarded on the helper existing so this also applies to a local Postgres
--    that has no Supabase `auth` schema.
alter table scripts         enable row level security;
alter table script_activity enable row level security;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_valid_user') then
    execute 'drop policy if exists "scripts readable by valid users" on public.scripts';
    execute 'create policy "scripts readable by valid users" on public.scripts
      for select using (public.is_valid_user())';

    execute 'drop policy if exists "script activity readable by valid users" on public.script_activity';
    execute 'create policy "script activity readable by valid users" on public.script_activity
      for select using (public.is_valid_user())';
  end if;
end $$;
