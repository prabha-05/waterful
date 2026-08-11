-- Per-ad audience breakdowns (2026-08): who a creative actually reached.
-- Meta allows age+gender together, and region separately — never combined —
-- so one table with a `dimension` discriminator holds all of them.
--   dimension 'age'    → segment '35-44'
--   dimension 'gender' → segment 'male'
--   dimension 'age_gender' → segment '35-44 male'
--   dimension 'region' → segment 'Maharashtra'  (spend/impressions only;
--                        Meta attributes no revenue by region)
create table if not exists public.ad_demographic_metrics (
  ad_id text not null references public.ad_activations(meta_ad_id) on delete cascade,
  dimension text not null,
  segment text not null,
  spend numeric(14,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions bigint not null default 0,
  reach bigint not null default 0,
  "window" text not null default '28d',
  synced_at timestamptz not null default now(),
  primary key (ad_id, dimension, segment)
);
--> statement-breakpoint
alter table public.ad_demographic_metrics enable row level security;
--> statement-breakpoint
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_valid_user') then
    execute 'drop policy if exists "demographics readable by valid users" on public.ad_demographic_metrics';
    execute 'create policy "demographics readable by valid users" on public.ad_demographic_metrics
      for select using (public.is_valid_user())';
  end if;
end $$;
