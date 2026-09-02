-- The team's agreed model (2026-09-02): Persona → Angle (Communication) →
-- Stage → Concept. Everything else stays in Master Data, it just stops
-- appearing on the script form.

-- Which dimensions the Script Library asks for. Everything else remains
-- manageable in Master Data and taggable on upload; this only controls the
-- script drawer, so the team can change its mind without a migration.
alter table tag_groups add column if not exists show_on_script boolean not null default false;
--> statement-breakpoint

-- "Audience State" becomes the team's Stage, in their words.
update tag_groups set key = 'stage', label = 'Stage', show_on_script = true
where key = 'audience_state';
--> statement-breakpoint

update tags t set label = v.new
from (values
  ('The Unbothered', 'Unbothered'),
  ('The Seeker', 'Seeker'),
  ('The Skeptic', 'Skeptic'),
  ('Existing Consumer', 'Customer')
) as v(old, new)
where t.label = v.old
  and t.group_id = (select id from tag_groups where key = 'stage');
--> statement-breakpoint

-- "The Aware" has no equivalent — a person who knows the problem and is
-- looking is a Seeker. Move its taggings before removing it.
update creative_tags ct set tag_id = (
  select id from tags where label = 'Seeker'
    and group_id = (select id from tag_groups where key = 'stage'))
where ct.tag_id in (
  select id from tags where label = 'The Aware'
    and group_id = (select id from tag_groups where key = 'stage'))
  and not exists (
    select 1 from creative_tags x
    where x.creative_id = ct.creative_id
      and x.tag_id = (select id from tags where label = 'Seeker'
        and group_id = (select id from tag_groups where key = 'stage')));
--> statement-breakpoint

-- Scripts carry this tag too — move them before deleting, or six scripts
-- silently lose their stage.
update script_tags st set tag_id = (
  select id from tags where label = 'Seeker'
    and group_id = (select id from tag_groups where key = 'stage'))
where st.tag_id in (
  select id from tags where label = 'The Aware'
    and group_id = (select id from tag_groups where key = 'stage'))
  and not exists (
    select 1 from script_tags x
    where x.script_id = st.script_id
      and x.tag_id = (select id from tags where label = 'Seeker'
        and group_id = (select id from tag_groups where key = 'stage')));
--> statement-breakpoint

delete from creative_tags where tag_id in (
  select id from tags where label = 'The Aware'
    and group_id = (select id from tag_groups where key = 'stage'));
--> statement-breakpoint
delete from script_tags where tag_id in (
  select id from tags where label = 'The Aware'
    and group_id = (select id from tag_groups where key = 'stage'));
--> statement-breakpoint
delete from tags where label = 'The Aware'
  and group_id = (select id from tag_groups where key = 'stage');
--> statement-breakpoint

-- "Content Format" is the team's Concept. Values already read as concepts
-- (POV, Skit, Founder-led, UGC, Testimonial, ASMR…). Static and Carousel are
-- deliberately NOT added here — they are formats and already live on Type,
-- so adding them would put two different axes in one field.
update tag_groups set key = 'concept', label = 'Concept', show_on_script = true
where key = 'content_format';
--> statement-breakpoint

-- Seed Stage from the awareness ladder 89 creatives already carry, so the new
-- field is populated on day one rather than starting empty. Awareness stays in
-- Master Data untouched; this only reads it.
insert into creative_tags (creative_id, tag_id)
select c.id, t.id
from creatives c
join awareness_stages aw on aw.id = c.awareness_id
join (values
  ('Unaware', 'Unbothered'),
  ('Problem-aware', 'Seeker'),
  ('Solution-aware', 'Seeker'),
  ('Product-aware', 'Skeptic'),
  ('Most-aware', 'Customer')
) as m(from_label, to_label) on m.from_label = aw.label
join tags t on t.label = m.to_label
  and t.group_id = (select id from tag_groups where key = 'stage')
on conflict do nothing;
