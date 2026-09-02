-- Creative Format joins the script form, so writers state the format they are
-- writing for. Because "required to leave Draft" is defined as show_on_script,
-- this one flag both puts it on the form and makes it mandatory.
update tag_groups set show_on_script = true where key = 'creative_format';
