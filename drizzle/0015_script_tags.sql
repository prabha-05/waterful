-- Scripts carry the same dimensions as creatives (Product USP, Content Format,
-- Communication Job, Audience State), so the classification decided when the
-- script is written flows into the creative uploaded against it.

create table if not exists script_tags (
  script_id uuid not null references scripts(id) on delete cascade,
  tag_id    uuid not null references tags(id),
  primary key (script_id, tag_id)
);
--> statement-breakpoint

create index if not exists script_tags_tag_idx on script_tags (tag_id);
--> statement-breakpoint

alter table script_tags enable row level security;
--> statement-breakpoint

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_valid_user') then
    execute 'drop policy if exists "script tags readable by valid users" on public.script_tags';
    execute 'create policy "script tags readable by valid users" on public.script_tags
      for select using (public.is_valid_user())';
  end if;
end $$;
