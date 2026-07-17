-- Placement breakdown (2026-07): per-ad spend/revenue by publisher_platform ×
-- platform_position, snapshotted over the synced window and replaced each sync.
-- Answers "where did this ad's spend actually go" inside the Ad frame.
create table if not exists public.ad_placement_metrics (
  ad_id text not null references public.ad_activations(meta_ad_id) on delete cascade,
  platform text not null,
  position text not null,
  spend numeric(14,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions bigint not null default 0,
  "window" text not null default '28d',
  synced_at timestamptz not null default now(),
  primary key (ad_id, platform, position)
);
--> statement-breakpoint
alter table public.ad_placement_metrics enable row level security;
--> statement-breakpoint
create policy "placement metrics readable by valid users" on public.ad_placement_metrics
  for select using (public.is_valid_user());
