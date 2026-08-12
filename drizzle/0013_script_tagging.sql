-- Full tagging on a script. The prototype's detail view carries the whole
-- taxonomy — "Tagging · from Master Data · the creative inherits all of it" —
-- so the classification is decided once, when the script is written, and the
-- creative inherits it at upload instead of being re-tagged from memory.
--
-- The first pass only stored a single angle + persona, which was read from the
-- written spec rather than the prototype.

alter table scripts add column if not exists subtype_id   uuid references subtypes(id);
alter table scripts add column if not exists awareness_id uuid references awareness_stages(id);
alter table scripts add column if not exists hook_id      uuid references hook_types(id);
alter table scripts add column if not exists type_id      uuid references types(id);

-- Personas are many per script (mapped to the chosen angle), same as creatives.
create table if not exists script_personas (
  script_id  uuid not null references scripts(id) on delete cascade,
  persona_id uuid not null references personas(id),
  primary key (script_id, persona_id)
);

-- Carry over anything the single-persona column already holds, then retire it.
insert into script_personas (script_id, persona_id)
select id, persona_id from scripts
where persona_id is not null
on conflict do nothing;

alter table scripts drop column if exists persona_id;

-- `type` was free text; types.id is the real taxonomy. Match on label where we can.
update scripts s set type_id = t.id
from types t
where s.type_id is null and s.type is not null and lower(t.label) = lower(s.type);

alter table script_personas enable row level security;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_valid_user') then
    execute 'drop policy if exists "script personas readable by valid users" on public.script_personas';
    execute 'create policy "script personas readable by valid users" on public.script_personas
      for select using (public.is_valid_user())';
  end if;
end $$;
