-- The team's new Persona/Angle pairs from the tagging sheet (2026-09-08):
--   Fitness            → Pre-workout drink, "you left more than sweat - need preworkout"
--   Parenting / Family → Health + taste for kids and family, Birthday Party
-- Labels are the sheet's own words. Idempotent: labels have no unique index,
-- so every insert guards on not exists.

insert into personas (label)
select v.label from (values
  ('Fitness'),
  ('Parenting / Family')
) as v(label)
where not exists (select 1 from personas p where p.label = v.label);
--> statement-breakpoint

insert into angles (label)
select v.label from (values
  ('Pre-workout drink'),
  ('you left more than sweat - need preworkout'),
  ('Health + taste for kids and family'),
  ('Birthday Party')
) as v(label)
where not exists (select 1 from angles a where a.label = v.label);
--> statement-breakpoint

insert into angle_personas (angle_id, persona_id)
select a.id, p.id
from (values
  ('Pre-workout drink',                         'Fitness'),
  ('you left more than sweat - need preworkout', 'Fitness'),
  ('Health + taste for kids and family',         'Parenting / Family'),
  ('Birthday Party',                             'Parenting / Family')
) as m(angle_label, persona_label)
join angles a   on a.label = m.angle_label
join personas p on p.label = m.persona_label
on conflict do nothing;
