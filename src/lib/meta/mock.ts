/**
 * MOCK Meta provider (decisions §10). Generates deterministic, plausible data from
 * the Ad ID so the whole core loop is testable without real Meta credentials.
 * Swap this for the real Meta Marketing API in the integration phase — keep the
 * same return shapes (lib/meta/types.ts) and the §6 aggregation contract:
 *   - daily rows carry ADDITIVE metrics (sum for any range) + per-day reach,
 *   - range reach/frequency are de-duplicated, returned separately (G1).
 */
import type { MetaActivation, MetaDaily, MetaPull, MetaRange } from "./types";

// ---- deterministic PRNG seeded by the Ad ID -------------------------------
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: () => number, arr: T[]) =>
  arr[Math.floor(rng() * arr.length)];
const between = (rng: () => number, lo: number, hi: number) =>
  lo + rng() * (hi - lo);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const OBJECTIVES = ["Sales", "Leads", "Traffic", "Engagement"];
const OPTIMIZATIONS = ["Conversions", "Link clicks", "Landing page views"];
const PLACEMENTS = [
  "Feed",
  "Reels",
  "Stories",
  "Advantage+ placements",
  "Marketplace",
];
const CAMPAIGN_THEMES = [
  "Hydration Push",
  "Zero Sugar",
  "Eco Bottles",
  "Festive Offer",
  "Always-On",
];

/**
 * Pull data for an ad. `since` controls the window:
 *   - omit → full history (campaign start → today): the on-link lifetime backfill.
 *   - Date → only that window forward: the nightly 28-day re-pull.
 */
export function fetchMetaData(
  adId: string,
  opts: { isVideo: boolean; since?: Date } = { isVideo: false },
): MetaPull {
  const rng = mulberry32(hashSeed(adId));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ageDays = Math.floor(between(rng, 30, 120));
  const campaignStartDate = new Date(today);
  campaignStartDate.setDate(today.getDate() - ageDays);

  const from = opts.since && opts.since > campaignStartDate ? opts.since : campaignStartDate;

  // Per-ad baselines.
  const baseSpend = between(rng, 600, 4500); // ₹/day
  const baseRoas = between(rng, 0.8, 3.8);
  const cpm = between(rng, 90, 380); // ₹ per 1000 impressions
  const ctr = between(rng, 0.005, 0.03);
  const cvr = between(rng, 0.02, 0.1);
  const trend = pick(rng, [-1, 0, 0, 1]); // down / steady / steady / up
  const status = rng() < 0.18 ? "paused" : "active";

  const daily: MetaDaily[] = [];
  for (
    let d = new Date(from);
    d <= today;
    d.setDate(d.getDate() + 1)
  ) {
    // progress 0..1 across the *full* campaign life (so trend is stable).
    const progress =
      (d.getTime() - campaignStartDate.getTime()) /
      Math.max(1, today.getTime() - campaignStartDate.getTime());
    const trendFactor = 1 + trend * (progress - 0.5) * 0.6; // ±30% drift
    const noise = between(rng, 0.75, 1.25);

    const spend = Math.max(0, baseSpend * trendFactor * noise);
    const impressions = Math.round((spend / cpm) * 1000);
    const clicks = Math.round(impressions * ctr * between(rng, 0.85, 1.15));
    const conversions = Math.round(clicks * cvr * between(rng, 0.7, 1.3));
    const roasDay = baseRoas * trendFactor * between(rng, 0.85, 1.15);
    const revenue = Math.round(spend * roasDay);
    const dailyFreq = between(rng, 1.05, 1.45);
    const reach = Math.round(impressions / dailyFreq);

    daily.push({
      asOfDate: ymd(d),
      spend: Math.round(spend),
      revenue,
      impressions,
      reach,
      clicks,
      conversions,
      thumbstop: opts.isVideo ? +between(rng, 0.18, 0.52).toFixed(4) : null,
      hold: opts.isVideo ? +between(rng, 0.04, 0.22).toFixed(4) : null,
    });
  }

  // Range-level de-duplicated reach/frequency (§6 G1) — NOT a sum of daily reach.
  const sumImpr = (rows: MetaDaily[]) =>
    rows.reduce((s, r) => s + r.impressions, 0);
  const last7 = daily.slice(-7);
  const prior7 = daily.slice(-14, -7);
  const mkRange = (
    range: MetaRange["range"],
    rows: MetaDaily[],
    freqLo: number,
    freqHi: number,
  ): MetaRange => {
    const impr = sumImpr(rows);
    const frequency = +between(rng, freqLo, freqHi).toFixed(2);
    const reach = frequency > 0 ? Math.round(impr / frequency) : 0;
    return { range, reach, frequency };
  };

  const ranges: MetaRange[] = [
    mkRange("lifetime", daily, 1.8, 4.0),
    mkRange("last_7", last7, 1.3, 2.2),
    mkRange("prior_7", prior7, 1.3, 2.2),
  ];

  const seq = hashSeed(adId) % 9000;
  const activation: MetaActivation = {
    campaignId: `cmp_${100000 + seq}`,
    adsetId: `as_${200000 + seq}`,
    placement: pick(rng, PLACEMENTS),
    status,
    campaignName: `${pick(rng, CAMPAIGN_THEMES)} — ${pick(rng, OBJECTIVES)}`,
    adsetName: `AS ${pick(rng, ["Broad", "Lookalike 1%", "Interest", "Retarget"])}`,
    objective: pick(rng, OBJECTIVES),
    budgetType: rng() < 0.5 ? "CBO" : "Ad set budget",
    dailyBudget: Math.round(baseSpend / 100) * 100,
    optimization: pick(rng, OPTIMIZATIONS),
  };

  return { activation, daily, ranges, campaignStart: ymd(campaignStartDate) };
}
