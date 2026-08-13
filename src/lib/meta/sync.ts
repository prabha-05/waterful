/*
 * Deliberately NOT marked `server-only`. This runner is shared by two callers:
 * the in-app Meta Sync console (a server action) and the standalone Render cron
 * worker, which runs under tsx with no Next.js resolver. `server-only` is not a
 * real dependency — Next supplies it at build time — so importing it here made
 * the worker die on startup with "Cannot find module 'server-only'". That is why
 * no automatic sync ran between 13 July and 12 August 2026.
 *
 * Nothing client-side imports this module; the guard was never load-bearing.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adActivations,
  adDemographicMetrics,
  adMetrics,
  adRangeMetrics,
  creatives,
  syncRuns,
  types,
} from "@/lib/db/schema";
import { fetchMetaData } from "@/lib/meta";
import { refreshShopifyRevenue } from "@/lib/shopify/sync";

export type SyncKind = "auto" | "manual" | "rebuild";
export type SyncWindow = "28d" | "full";

/**
 * Re-pull Meta data for all linked ads (decisions §6). `28d` = rolling re-pull
 * (nightly/manual); `full` = rebuild from each ad's start. Upserts daily rows on
 * (ad_id, as_of_date); refreshes de-duplicated range reach/frequency (G1); mirrors
 * ad status. Logs to sync_runs and locks against concurrent runs.
 */
export async function runMetaSync(
  kind: SyncKind,
  window: SyncWindow,
  triggeredBy?: string | null,
): Promise<{ ok: boolean; ads: number; error?: string }> {
  // Concurrency lock (decisions §6) — don't collide with the cron or another manual run.
  const [running] = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"));
  if (running)
    return { ok: false, ads: 0, error: "A sync is already running." };

  const [run] = await db
    .insert(syncRuns)
    .values({
      kind,
      window,
      status: "running",
      triggeredBy: triggeredBy ?? null,
    })
    .returning({ id: syncRuns.id });

  try {
    const ads = await db
      .select({ adId: adActivations.metaAdId, type: types.label })
      .from(adActivations)
      .innerJoin(creatives, eq(creatives.id, adActivations.creativeId))
      .innerJoin(types, eq(types.id, creatives.typeId));

    let since: Date | undefined;
    if (window === "28d") {
      since = new Date();
      since.setDate(since.getDate() - 28);
    }

    /**
     * Ads run a few at a time rather than one after another. Each ad is ~1s of
     * Meta latency even with its own calls parallelised, so 77 sequential ads
     * meant a five-minute sync. Concurrency stays deliberately low: the total
     * number of Meta calls is unchanged, and a wide burst is the thing most
     * likely to trip the hourly rate limit.
     */
    const CONCURRENCY = 4;
    let count = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < ads.length) {
        const ad = ads[cursor++];
        try {
          await syncOneAd(ad, since, window);
          count++;
        } catch (e) {
          // One ad failing (rate limit, deleted in Meta) must not lose the rest.
          console.log(`[sync] ${ad.adId} failed: ${(e as Error).message}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ads.length) }, worker),
    );

    // Shopify revenue rides along with the Meta pull. Without this the
    // revenue-by-state figures freeze at whenever they were last loaded and go
    // quietly, invisibly stale — worse than being absent, because people make
    // budget calls on them. A Shopify failure must NOT fail the Meta sync, so
    // the outcome is logged and swallowed.
    let shopify = "";
    try {
      const res = await refreshShopifyRevenue(
        window === "full" ? new Date("2026-05-01") : since,
      );
      if (!res.ok) shopify = `shopify failed: ${res.error}`;
      else if (res.skipped) shopify = `shopify skipped (${res.reason})`;
      else
        shopify = `shopify: ${res.attributed}/${res.orders} orders attributed`;
    } catch (e) {
      shopify = `shopify threw: ${(e as Error).message}`;
    }
    console.log(`[sync] ${count} ads · ${shopify}`);

    await db
      .update(syncRuns)
      .set({ status: "success", finishedAt: new Date(), adsCount: count })
      .where(eq(syncRuns.id, run.id));
    return { ok: true, ads: count };
  } catch (e) {
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(syncRuns.id, run.id));
    return { ok: false, ads: 0, error: (e as Error).message };
  }
}

/** One ad's pull + upserts. Extracted so the runner can process several at once. */
async function syncOneAd(
  ad: { adId: string; type: string },
  since: Date | undefined,
  window: SyncWindow,
) {
  const pull = await fetchMetaData(ad.adId, {
    isVideo: ad.type === "Video",
    since,
  });

  if (pull.daily.length > 0) {
    await db
      .insert(adMetrics)
      .values(
        pull.daily.map((d) => ({
          adId: ad.adId,
          asOfDate: d.asOfDate,
          spend: String(d.spend),
          revenue: String(d.revenue),
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          reach: d.reach,
          thumbstop: d.thumbstop === null ? null : String(d.thumbstop),
          hold: d.hold === null ? null : String(d.hold),
        })),
      )
      .onConflictDoUpdate({
        target: [adMetrics.adId, adMetrics.asOfDate],
        set: {
          spend: sql`excluded.spend`,
          revenue: sql`excluded.revenue`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          conversions: sql`excluded.conversions`,
          reach: sql`excluded.reach`,
          thumbstop: sql`excluded.thumbstop`,
          hold: sql`excluded.hold`,
        },
      });
  }

  // Range reach/frequency: replace (de-duplicated, pulled per range — §6 G1).
  await db.delete(adRangeMetrics).where(eq(adRangeMetrics.adId, ad.adId));
  if (pull.ranges.length > 0) {
    await db.insert(adRangeMetrics).values(
      pull.ranges.map((r) => ({
        adId: ad.adId,
        range: r.range,
        reach: r.reach,
        frequency: String(r.frequency),
        asOfDate: new Date().toISOString().slice(0, 10),
      })),
    );
  }

  // Audience breakdowns: upsert per (ad, day, dimension, segment). NOT a
  // delete-then-insert — these are now a daily series, and a 28-day sync
  // must refresh its own window without erasing older history.
  // Chunked because a lifetime rebuild can return thousands of rows per ad
  // and Postgres caps a statement at 65535 bind parameters.
  for (let i = 0; i < pull.demographics.length; i += 500) {
    await db
      .insert(adDemographicMetrics)
      .values(
        pull.demographics.slice(i, i + 500).map((d) => ({
          adId: ad.adId,
          asOfDate: d.asOfDate,
          dimension: d.dimension,
          segment: d.segment,
          spend: String(d.spend),
          revenue: String(d.revenue),
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          reach: d.reach,
          window,
          syncedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [
          adDemographicMetrics.adId,
          adDemographicMetrics.asOfDate,
          adDemographicMetrics.dimension,
          adDemographicMetrics.segment,
        ],
        set: {
          spend: sql`excluded.spend`,
          revenue: sql`excluded.revenue`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          conversions: sql`excluded.conversions`,
          reach: sql`excluded.reach`,
          window: sql`excluded.window`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  await db
    .update(adActivations)
    .set({ status: pull.activation.status, lastSyncedAt: new Date() })
    .where(eq(adActivations.metaAdId, ad.adId));

  await db
    .update(adActivations)
    .set({ status: pull.activation.status, lastSyncedAt: new Date() })
    .where(eq(adActivations.metaAdId, ad.adId));
}
