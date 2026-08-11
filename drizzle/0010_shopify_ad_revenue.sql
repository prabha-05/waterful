-- TRUE per-ad revenue: Shopify orders carrying utm_content={{ad.id}} from Meta.
-- GoKwik copies the UTM onto the order note_attributes; non-GoKwik orders keep
-- it in landing_site. This is last-click attribution measured on real orders —
-- unlike Meta's modelled conversion value, and unlike store-wide regional
-- revenue, it is genuinely THIS ad's money, broken down by state.
create table if not exists shopify_ad_revenue (
  ad_id      text          not null,
  as_of_date date          not null,
  region     text          not null,   -- normalised to Meta's region naming
  orders     integer       not null default 0,
  revenue    numeric(14,2) not null default 0,
  synced_at  timestamptz   not null default now(),
  primary key (ad_id, as_of_date, region)
);

create index if not exists shopify_ad_revenue_ad_idx on shopify_ad_revenue (ad_id);
