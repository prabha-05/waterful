-- Shopify revenue by region and day. Meta cannot report revenue broken down by
-- region (it strips conversion actions from region queries), so the store's own
-- order data is the only source of truth for where sales actually come from.
-- Store-wide, not per-ad: Shopify does not know which ad drove an order.
create table if not exists shopify_regional_revenue (
  as_of_date   date          not null,
  region       text          not null,        -- normalised to Meta's region naming
  orders       integer       not null default 0,
  revenue      numeric(14,2) not null default 0,  -- all non-cancelled orders (COD included)
  paid_orders  integer       not null default 0,
  paid_revenue numeric(14,2) not null default 0,  -- financial_status = 'paid' only
  synced_at    timestamptz   not null default now(),
  primary key (as_of_date, region)
);

create index if not exists shopify_regional_revenue_date_idx
  on shopify_regional_revenue (as_of_date);
