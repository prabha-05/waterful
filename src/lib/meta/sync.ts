import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adActivations,
  adMetrics,
  adRangeMetrics,
  creatives,
  syncRuns,
  types,
} from "@/lib/db/schema";
import { fetchMetaData } from "@/lib/meta";

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
  if (running) return { ok: false, ads: 0, error: "A sync is already running." };

  const [run] = await db
    .insert(syncRuns)
    .values({ kind, window, status: "running", triggeredBy: triggeredBy ?? null })
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

    let count = 0;
    for (const ad of ads) {
      const pull = await fetchMetaData(ad.adId, { isVideo: ad.type === "Video", since });

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

      await db
        .update(adActivations)
        .set({ status: pull.activation.status, lastSyncedAt: new Date() })
        .where(eq(adActivations.metaAdId, ad.adId));

      count++;
    }

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
