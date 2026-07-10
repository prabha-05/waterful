-- Meta Sync permission (2026-07): lets non-admins run the manual 28-day re-pull.
-- Granted to Admin and Performance so Deepak can sync before calls; Full Rebuild
-- stays behind `master`. New/other roles default to false.
alter table public.roles add column if not exists perm_sync boolean not null default false;
--> statement-breakpoint
update public.roles set perm_sync = true where label in ('Admin', 'Performance');
