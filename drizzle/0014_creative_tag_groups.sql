-- Waterful tagging framework (2026-08-24): six brand dimensions from the
-- planning sheet. Rather than a table per dimension (the shape personas /
-- angles / awareness_stages / hook_types grew into), this is a generic
-- group→tag pair so a new dimension is a row, not a migration.
--
-- CONTENT ANGLE is deliberately NOT a group here — `angles` already is that
-- dimension and is required on every upload; the sheet's missing values are
-- added to it below so there is one angle list, not two.

create table if not exists tag_groups (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  label       text not null,
  -- true → a creative may carry several tags from this group (USPs stack).
  multi       boolean not null default false,
  position    int not null default 0,
  archived_at timestamptz
);
--> statement-breakpoint

create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references tag_groups(id) on delete cascade,
  label       text not null,
  position    int not null default 0,
  archived_at timestamptz
);
--> statement-breakpoint

create unique index if not exists tags_group_label_idx on tags (group_id, lower(label));
--> statement-breakpoint

-- Applied tags. Nothing writes here yet — Upload/Edit wiring is a follow-up —
-- but usage counts read from it, so Master Data's delete-vs-archive rule works
-- from day one.
create table if not exists creative_tags (
  creative_id uuid not null references creatives(id) on delete cascade,
  tag_id      uuid not null references tags(id),
  primary key (creative_id, tag_id)
);
--> statement-breakpoint

create index if not exists creative_tags_tag_idx on creative_tags (tag_id);
--> statement-breakpoint

insert into tag_groups (key, label, multi, position) values
  ('product_usp',       'Product USP',       true,  1),
  ('content_format',    'Content Format',    false, 2),
  ('communication_job', 'Communication Job', false, 3),
  ('audience_state',    'Audience State',    false, 4),
  ('creative_format',   'Creative Format',   false, 5)
on conflict (key) do nothing;
--> statement-breakpoint

insert into tags (group_id, label, position)
select g.id, v.label, v.position
from tag_groups g
join (values
  ('product_usp', 'Electrolyte pre-mix', 1),
  ('product_usp', 'Powder form', 2),
  ('product_usp', '5 Flavours', 3),
  ('product_usp', 'Each packet - 7.5g', 4),
  ('product_usp', 'Zero Sugar', 5),
  ('product_usp', 'Zero Caffeine', 6),
  ('product_usp', '10+ Vitamins & Minerals', 7),
  ('product_usp', 'For Daily Hydration', 8),
  ('product_usp', '100% Natural fruit flavour & color', 9),
  ('product_usp', 'Antioxidant & Immunity Booster', 10),
  ('product_usp', 'Acidity Regulators', 11),

  ('content_format', 'POV', 1),
  ('content_format', 'Skit', 2),
  ('content_format', 'Founder-led', 3),
  ('content_format', 'UGC', 4),
  ('content_format', 'Aesthetic led, product shots', 5),
  ('content_format', 'ASMR', 6),
  ('content_format', 'Meme', 7),
  ('content_format', 'Testimonial', 8),
  ('content_format', 'Street Reaction / Vox-Pop', 9),

  ('communication_job', 'Create a Problem', 1),
  ('communication_job', 'Create Desire', 2),
  ('communication_job', 'Remove a Barrier', 3),
  ('communication_job', 'Give a Reason to Believe', 4),
  ('communication_job', 'Create Relevance', 5),

  ('audience_state', 'The Unbothered', 1),
  ('audience_state', 'The Aware', 2),
  ('audience_state', 'The Seeker', 3),
  ('audience_state', 'The Skeptic', 4),
  ('audience_state', 'Existing Consumer', 5),

  ('creative_format', 'Ai Static / Carousel', 1),
  ('creative_format', 'Static / Carousel', 2),
  ('creative_format', 'Ai Video', 3),
  ('creative_format', 'Video', 4),
  ('creative_format', 'Motion Static', 5)
) as v(group_key, label, position) on v.group_key = g.key
on conflict do nothing;
--> statement-breakpoint

-- CONTENT ANGLE folds into the existing angle list. Only the four the sheet
-- adds — Ingredient Transparency / Education / Convenience are already there,
-- and the legacy angles stay put because 90 creatives are tagged on them.
insert into angles (label)
select v.label
from (values
  ('Better Alternative'),
  ('Lifestyle Integration'),
  ('Taste & Enjoyment'),
  ('Product Superiority')
) as v(label)
where not exists (
  select 1 from angles a where lower(a.label) = lower(v.label)
);
--> statement-breakpoint

alter table tag_groups enable row level security;
--> statement-breakpoint
alter table tags enable row level security;
--> statement-breakpoint
alter table creative_tags enable row level security;
--> statement-breakpoint

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_valid_user') then
    execute 'drop policy if exists "tag groups readable by valid users" on public.tag_groups';
    execute 'create policy "tag groups readable by valid users" on public.tag_groups
      for select using (public.is_valid_user())';
    execute 'drop policy if exists "tags readable by valid users" on public.tags';
    execute 'create policy "tags readable by valid users" on public.tags
      for select using (public.is_valid_user())';
    execute 'drop policy if exists "creative tags readable by valid users" on public.creative_tags';
    execute 'create policy "creative tags readable by valid users" on public.creative_tags
      for select using (public.is_valid_user())';
  end if;
end $$;
