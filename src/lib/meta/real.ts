import type {
  MetaActivation,
  MetaAdStatus,
  MetaDaily,
  MetaPull,
  MetaRange,
} from "./types";

/**
 * REAL Meta Marketing API provider (decisions §6/§10, BUILD_GUIDE §3).
 * Active when META_ACCESS_TOKEN is set (see lib/meta/index.ts). Returns the same
 * MetaPull shape as the mock so the UI/data layer are unchanged.
 *
 * Aggregation contract (§6 G1): daily rows carry ADDITIVE metrics + per-day reach;
 * de-duplicated reach/frequency are pulled per range (lifetime / last_7 / prior_7),
 * never summed. Meta returns reach/frequency already de-duplicated per range.
 */
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN is not set.");
  return t;
}

type GraphParams = Record<string, string>;

async function graph(path: string, params: GraphParams): Promise<any> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(
      `Meta API error: ${e.message ?? res.statusText} (code ${e.code ?? res.status})`,
    );
  }
  return json;
}

/** Follow paging.next to collect all insight rows. */
async function graphAll(path: string, params: GraphParams): Promise<any[]> {
  const out: any[] = [];
  let json = await graph(path, params);
  out.push(...(json.data ?? []));
  while (json.paging?.next) {
    const res = await fetch(json.paging.next, { cache: "no-store" });
    json = await res.json();
    if (json.error) break;
    out.push(...(json.data ?? []));
  }
  return out;
}

function mapStatus(s?: string): MetaAdStatus {
  switch ((s ?? "").toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
    case "ADSET_PAUSED":
    case "CAMPAIGN_PAUSED":
      return "paused";
    case "ARCHIVED":
    case "DELETED":
      return "archived";
    case "PENDING_REVIEW":
    case "IN_PROCESS":
    case "PENDING_BILLING_INFO":
      return "pending";
    default:
      return "unknown";
  }
}

type ActionItem = { action_type: string; value: string };

/** Pick the purchase value/count from an actions / action_values array. */
function purchase(arr?: ActionItem[]): number {
  if (!arr) return 0;
  const order = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
  for (const t of order) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

function videoValue(arr?: ActionItem[]): number {
  if (!arr || arr.length === 0) return 0;
  // video_play_actions / thruplay arrays carry a single 'video_view' entry.
  return Number(arr[0]?.value) || 0;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const INSIGHT_FIELDS =
  "spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values,video_play_actions,video_thruplay_watched_actions";

export async function fetchMetaData(
  adId: string,
  opts: { isVideo: boolean; since?: Date },
): Promise<MetaPull> {
  // 1) Ad node — campaign / ad set / placement / objective / budget / status.
  const ad = await graph(adId, {
    fields:
      "id,effective_status,campaign{id,name,objective,daily_budget},adset{id,name,optimization_goal,daily_budget,targeting{publisher_platforms}}",
  });

  const placements: string[] = ad?.adset?.targeting?.publisher_platforms ?? [];
  const campaignDaily = Number(ad?.campaign?.daily_budget ?? 0);
  const adsetDaily = Number(ad?.adset?.daily_budget ?? 0);
  const activation: MetaActivation = {
    campaignId: ad?.campaign?.id ?? "",
    adsetId: ad?.adset?.id ?? "",
    placement: placements.length ? placements.join(", ") : "Automatic",
    status: mapStatus(ad?.effective_status),
    campaignName: ad?.campaign?.name ?? "",
    adsetName: ad?.adset?.name ?? "",
    objective: ad?.campaign?.objective ?? "",
    budgetType: campaignDaily > 0 ? "CBO" : "Ad set budget",
    dailyBudget: (campaignDaily || adsetDaily) / 100, // minor units → currency
    optimization: ad?.adset?.optimization_goal ?? "",
  };

  // 2) Daily series (additive metrics + per-day reach). time_increment=1.
  const dailyParams: GraphParams = {
    fields: INSIGHT_FIELDS,
    time_increment: "1",
    limit: "500",
  };
  if (opts.since) {
    dailyParams.time_range = JSON.stringify({
      since: ymd(opts.since),
      until: ymd(new Date()),
    });
  } else {
    dailyParams.date_preset = "maximum";
  }
  const rows = await graphAll(`${adId}/insights`, dailyParams);

  const daily: MetaDaily[] = rows.map((r) => {
    const impressions = Number(r.impressions) || 0;
    const thumb = videoValue(r.video_play_actions);
    const thru = videoValue(r.video_thruplay_watched_actions);
    return {
      asOfDate: r.date_start,
      spend: Number(r.spend) || 0,
      revenue: purchase(r.action_values),
      impressions,
      reach: Number(r.reach) || 0,
      clicks: Number(r.clicks) || 0,
      conversions: purchase(r.actions),
      thumbstop: opts.isVideo && impressions > 0 ? +(thumb / impressions).toFixed(4) : null,
      hold: opts.isVideo && impressions > 0 ? +(thru / impressions).toFixed(4) : null,
    };
  });

  // 3) Range-level de-duplicated reach/frequency (§6 G1) — one call per window.
  async function rangeReach(range: MetaRange["range"]): Promise<MetaRange> {
    const params: GraphParams = { fields: "reach,frequency" };
    if (range === "lifetime") params.date_preset = "maximum";
    else if (range === "last_7") params.date_preset = "last_7d";
    else {
      const until = new Date();
      until.setDate(until.getDate() - 7);
      const since = new Date();
      since.setDate(since.getDate() - 13);
      params.time_range = JSON.stringify({ since: ymd(since), until: ymd(until) });
    }
    const r = (await graph(`${adId}/insights`, params)).data?.[0] ?? {};
    return {
      range,
      reach: Number(r.reach) || 0,
      frequency: Number(r.frequency) || 0,
    };
  }

  const ranges = await Promise.all([
    rangeReach("lifetime"),
    rangeReach("last_7"),
    rangeReach("prior_7"),
  ]);

  const campaignStart = daily.length ? daily[0].asOfDate : ymd(new Date());

  return { activation, daily, ranges, campaignStart };
}
