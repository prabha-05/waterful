-- Concept comes off the script form. The team's required set is Persona,
-- Angle, Stage and Creative Format; Concept stays in Master Data and stays
-- taggable on upload, it is just not asked for when writing a script.
update tag_groups set show_on_script = false where key = 'concept';
