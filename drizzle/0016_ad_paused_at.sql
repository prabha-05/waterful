-- When an ad actually stopped running.
--
-- Meta exposes no paused_at on the ad itself: `status` is the current state and
-- `last_synced_at` is when WE looked. The real answer is in the account activity
-- log, where a transition to "Inactive" is a pause. The sync reads that log and
-- stamps it here.
--
-- Note it resolves through three levels: over half of these ads were never
-- paused as ads at all — their ADSET was switched off and everything under it
-- stopped (status ACTIVE, effective_status ADSET_PAUSED). So the lookup falls
-- back ad → adset → campaign.

alter table ad_activations add column if not exists paused_at timestamptz;
--> statement-breakpoint

comment on column ad_activations.paused_at is
  'When this ad last stopped delivering, from the Meta activity log. Null while it is running.';
