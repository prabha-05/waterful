-- Landing-page leak (2026-10-01): how many people tapped through to the site
-- vs how many the page actually loaded for, which page each ad sends them to,
-- and how fast that page is on a phone.

-- Meta "clicks" is clicks (all): likes, profile taps, "see more". Link clicks
-- are the taps that head to the site, and landing page views are the ones the
-- page loaded for. The gap between those two is the leak.
alter table ad_metrics add column if not exists link_clicks bigint not null default 0;
--> statement-breakpoint
alter table ad_metrics add column if not exists landing_page_views bigint not null default 0;
--> statement-breakpoint

-- Where the ad sends people, read from the ad creative on every sync.
alter table ad_activations add column if not exists landing_url text;
--> statement-breakpoint

-- Google PageSpeed Insights (mobile) per landing page. Keyed by the page
-- without its query string, so utm-tagged variants of one page share a result.
create table if not exists landing_page_speed (
  url text primary key,
  checked_at timestamptz not null default now(),
  score integer,
  fcp_ms integer,
  lcp_ms integer,
  tbt_ms integer,
  cls numeric(6,3),
  -- Real-visitor LCP from Chrome's field data, when Google has enough of it.
  field_lcp_ms integer,
  error text
);
--> statement-breakpoint
alter table landing_page_speed enable row level security;
--> statement-breakpoint
-- Guarded: the "authenticated" role only exists on Supabase, not on the
-- local dev Postgres, and RLS only bites over a Supabase-authed connection.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists read_landing_page_speed on landing_page_speed;
    create policy read_landing_page_speed on landing_page_speed
      for select to authenticated using (is_valid_user());
  end if;
end $$;
