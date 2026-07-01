-- ============================================================================
-- BOOTSTRAP SEED (decisions doc §8 Phase 0; README "Seeded values" authoritative)
-- ----------------------------------------------------------------------------
-- Seeds: roles (Admin locked all-on + Viewer locked all-off as system roles,
-- plus Content & Performance), the initial team + admins, and the full taxonomy.
-- The model can't admit anyone until one valid mapping exists (decisions §3).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles (six permission booleans, decisions §4)
--   Content     = upload
--   Performance = link, unlink, log
--   Admin       = all (locked on, system)
--   Viewer      = all off (locked, system) — mirror image of Admin
-- ---------------------------------------------------------------------------
insert into public.roles (label, is_system, is_locked, perm_upload, perm_link, perm_unlink, perm_log, perm_master, perm_access) values
  ('Admin',       true,  true,  true,  true,  true,  true,  true,  true),
  ('Performance', false, false, false, true,  true,  true,  false, false),
  ('Content',     false, false, true,  false, false, false, false, false),
  ('Viewer',      true,  true,  false, false, false, false, false, false);

-- ---------------------------------------------------------------------------
-- Initial team (README seeded Users — all @stranza.in)
--   Arjun / Barnali / Prathish = Content, Deepak = Performance,
--   Prabha / Muyeen = Admin (cover the bootstrap admin requirement).
-- ---------------------------------------------------------------------------
insert into public.users (name, email, role_id)
select v.name, v.email, r.id
from (values
  ('Prabha',   'prabha@stranza.in',   'Admin'),
  ('Muyeen',   'muyeen@stranza.in',   'Admin'),
  ('Deepak',   'deepak@stranza.in',   'Performance'),
  ('Arjun',    'arjun@stranza.in',    'Content'),
  ('Barnali',  'barnali@stranza.in',  'Content'),
  ('Prathish', 'prathish@stranza.in', 'Content')
) as v(name, email, role_label)
join public.roles r on r.label = v.role_label;

-- ---------------------------------------------------------------------------
-- Angles (README)
-- ---------------------------------------------------------------------------
insert into public.angles (label) values
  ('Sugar-averse'),
  ('Hydration & Electrolytes'),
  ('Clean Ingredients'),
  ('Plastic / Eco Guilt'),
  ('Cost vs Bottled Water'),
  ('Taste Without Guilt'),
  ('Convenience / On-the-go'),
  ('Immunity & Wellness'),
  ('Kids-safe');

-- ---------------------------------------------------------------------------
-- Personas (README)
-- ---------------------------------------------------------------------------
insert into public.personas (label) values
  ('Health-conscious Mother'),
  ('Gym-goer'),
  ('Office-goer / Urban Pro'),
  ('Young Parent'),
  ('Eco-conscious Gen-Z'),
  ('Weight-watcher'),
  ('Busy Traveler');

-- ---------------------------------------------------------------------------
-- Awareness stages (README)
-- ---------------------------------------------------------------------------
insert into public.awareness_stages (label) values
  ('Unaware'),
  ('Problem-aware'),
  ('Solution-aware'),
  ('Product-aware'),
  ('Most-aware');

-- ---------------------------------------------------------------------------
-- Hook types (README)
-- ---------------------------------------------------------------------------
insert into public.hook_types (label) values
  ('Question'),
  ('Stat / Claim'),
  ('POV'),
  ('Problem callout'),
  ('Pattern-interrupt');

-- ---------------------------------------------------------------------------
-- Types & sub-types (README data model). Every type auto-gets "Other / Untyped".
-- Sub→type grouping below is a sensible starting set; fully editable later via the
-- Master Data UI (Phase 3).
-- ---------------------------------------------------------------------------
insert into public.types (label) values ('Video'), ('Static'), ('Carousel');

insert into public.subtypes (type_id, label)
select t.id, s.label
from (values
  ('Video',    'UGC'),
  ('Video',    'AI'),
  ('Video',    'Founder'),
  ('Video',    'Testimonial'),
  ('Video',    'Demo'),
  ('Video',    'Other / Untyped'),
  ('Static',   'Product'),
  ('Static',   'Infographic'),
  ('Static',   'Comparison'),
  ('Static',   'Offer'),
  ('Static',   'AI'),
  ('Static',   'Other / Untyped'),
  ('Carousel', 'Product'),
  ('Carousel', 'Comparison'),
  ('Carousel', 'Offer'),
  ('Carousel', 'Other / Untyped')
) as s(type_label, label)
join public.types t on t.label = s.type_label;

-- ---------------------------------------------------------------------------
-- Angle ↔ Persona mapping (drives the Upload persona dropdown, README §6).
-- Initial editable mapping — adjust in Master Data · Angle ↔ Persona (Phase 3).
-- ---------------------------------------------------------------------------
insert into public.angle_personas (angle_id, persona_id)
select a.id, p.id
from (values
  ('Sugar-averse',             'Health-conscious Mother'),
  ('Sugar-averse',             'Weight-watcher'),
  ('Sugar-averse',             'Office-goer / Urban Pro'),
  ('Hydration & Electrolytes', 'Gym-goer'),
  ('Hydration & Electrolytes', 'Busy Traveler'),
  ('Hydration & Electrolytes', 'Office-goer / Urban Pro'),
  ('Clean Ingredients',        'Health-conscious Mother'),
  ('Clean Ingredients',        'Eco-conscious Gen-Z'),
  ('Clean Ingredients',        'Young Parent'),
  ('Plastic / Eco Guilt',      'Eco-conscious Gen-Z'),
  ('Plastic / Eco Guilt',      'Office-goer / Urban Pro'),
  ('Cost vs Bottled Water',    'Office-goer / Urban Pro'),
  ('Cost vs Bottled Water',    'Busy Traveler'),
  ('Taste Without Guilt',      'Weight-watcher'),
  ('Taste Without Guilt',      'Health-conscious Mother'),
  ('Convenience / On-the-go',  'Busy Traveler'),
  ('Convenience / On-the-go',  'Office-goer / Urban Pro'),
  ('Convenience / On-the-go',  'Gym-goer'),
  ('Immunity & Wellness',      'Health-conscious Mother'),
  ('Immunity & Wellness',      'Young Parent'),
  ('Immunity & Wellness',      'Gym-goer'),
  ('Kids-safe',                'Health-conscious Mother'),
  ('Kids-safe',                'Young Parent')
) as m(angle_label, persona_label)
join public.angles a   on a.label = m.angle_label
join public.personas p on p.label = m.persona_label;