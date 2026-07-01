/**
 * Meta sync worker (decisions §6). Runs as a SEPARATE Render service from the web
 * app so a long backfill never blocks web requests. Connects as the service role
 * via DATABASE_URL.
 *
 * Default entrypoint = the nightly 28-day rolling re-pull (Render Cron at 06:00).
 * Shares the same runner as the in-app Meta Sync console (lib/meta/sync.ts), which
 * upserts daily additive metrics on (ad_id, as_of_date) and refreshes de-duplicated
 * range reach/frequency (§6 G1).
 */
import { runMetaSync } from "@/lib/meta/sync";

async function main() {
  const res = await runMetaSync("auto", "28d");
  console.log(`[meta-sync] auto/28d → ${res.ok ? `${res.ads} ads` : `failed: ${res.error}`}`);
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[meta-sync] failed:", err);
  process.exit(1);
});
