/**
 * When each ad last stopped delivering, from Meta's account activity log.
 *
 * Meta gives no paused_at on the ad. What it does keep is an activity log where
 * a run-status transition to "Inactive" IS the pause, timestamped to the second.
 *
 * The catch that makes this more than a one-liner: an ad stops for more than one
 * reason. On this account 42 of 92 paused ads were paused as ads; the other 50
 * were never touched — their ADSET was switched off and everything under it
 * stopped (Meta reports those as status ACTIVE / effective_status ADSET_PAUSED).
 * So a pause time is resolved ad → adset → campaign, taking the first that has
 * one. With all three, every paused ad on the account resolves.
 *
 * One log read covers the whole account, so this is fetched once per sync rather
 * than per ad.
 */
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

/** Meta's word for "switched off" in the activity log. */
const OFF = "Inactive";

const LEVEL_EVENT = {
  ad: "update_ad_run_status",
  adset: "update_ad_set_run_status",
  campaign: "update_campaign_run_status",
} as const;

type ActivityRow = {
  event_type: string;
  event_time: string;
  object_id: string;
  extra_data: string;
};

export type PauseIndex = {
  /** Newest pause for an ad id, its adset, or its campaign — whichever exists. */
  resolve(ids: {
    adId: string;
    adsetId?: string | null;
    campaignId?: string | null;
  }): Date | null;
  /** How many events went into it — surfaced in the sync log. */
  size: number;
};

const EMPTY: PauseIndex = { resolve: () => null, size: 0 };

/**
 * Read the log once. `since` bounds it: a 28-day sync only needs recent changes,
 * a full rebuild wants everything. Failures are swallowed — a missing pause date
 * must never fail a metrics sync.
 */
export async function loadPauseIndex(since?: Date): Promise<PauseIndex> {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) return EMPTY;

  const byLevel = {
    ad: new Map<string, string>(),
    adset: new Map<string, string>(),
    campaign: new Map<string, string>(),
  };

  try {
    const url = new URL(`${BASE}/${account}/activities`);
    url.searchParams.set("fields", "event_type,event_time,object_id,extra_data");
    url.searchParams.set("limit", "500");
    url.searchParams.set("since", (since ?? new Date("2026-01-01")).toISOString().slice(0, 10));
    url.searchParams.set("access_token", token);

    let next: string | null = url.toString();
    let pages = 0;
    while (next && pages < 60) {
      const res: Response = await fetch(next, { cache: "no-store" });
      const json: { data?: ActivityRow[]; error?: unknown; paging?: { next?: string } } =
        await res.json();
      if (!res.ok || json.error) break;

      for (const row of json.data ?? []) {
        const level = (Object.keys(LEVEL_EVENT) as (keyof typeof LEVEL_EVENT)[]).find(
          (k) => LEVEL_EVENT[k] === row.event_type,
        );
        if (!level) continue;
        let extra: { new_value?: string } = {};
        try {
          extra = JSON.parse(row.extra_data);
        } catch {
          continue;
        }
        if (extra.new_value !== OFF) continue;
        const seen = byLevel[level].get(row.object_id);
        if (!seen || row.event_time > seen) byLevel[level].set(row.object_id, row.event_time);
      }

      next = json.paging?.next ?? null;
      pages++;
    }
  } catch {
    return EMPTY;
  }

  const size = byLevel.ad.size + byLevel.adset.size + byLevel.campaign.size;
  return {
    size,
    resolve({ adId, adsetId, campaignId }) {
      const raw =
        byLevel.ad.get(adId) ??
        (adsetId ? byLevel.adset.get(adsetId) : undefined) ??
        (campaignId ? byLevel.campaign.get(campaignId) : undefined);
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    },
  };
}
