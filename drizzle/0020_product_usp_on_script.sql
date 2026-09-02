-- Product USP joins the script form. It is multi-select, so "required" here
-- means at least one USP picked before the script can leave Draft.
update tag_groups set show_on_script = true where key = 'product_usp';
