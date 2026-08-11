import "server-only";
import { sqlClient } from "@/lib/db";
import { timed } from "@/lib/perf";

/**
 * Date-ranged reporting across every linked ad.
 *
 * Everything here re-aggregates DAILY rows between two dates, so the range is
 * genuine rather than a stored snapshot. Two caveats the UI must respect:
 *
 *  - `reach` is de-duplicated by Meta per row and is NOT summable. We do not
 *    report reach in ranged views at all rather than print a wrong number.
 *  - Region revenue never comes from Meta (it strips conversions from any geo
 *    breakdown); it comes from Shopify orders tagged with the ad id, and is
 *    last-click, so it reads as a floor.
 */

export type ReportRange = { from: string; to: string };

export type ReportTotals = {
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  activeAds: number;
  days: number;
  trackedRevenue: number;
  trackedOrders: number;
};

export type ReportAdRow = {
  adId: string;
  creativeId: string;
  title: string;
  type: string;
  angle: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpa: number;
  trackedRevenue: number;
  trackedOrders: number;
  firstDay: string;
  lastDay: string;
  daysActive: number;
};

export type BreakdownRow = {
  segment: string;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  clicks: number;
  impressions: number;
  ctr: number;
  share: number; // share of spend within its dimension
};

export type ReportData = {
  range: ReportRange;
  totals: ReportTotals;
  ads: ReportAdRow[];
  age: BreakdownRow[];
  gender: BreakdownRow[];
  ageGender: BreakdownRow[];
  region: BreakdownRow[];
  /** True when Shopify attribution is available (table exists and has rows). */
  hasShopify: boolean;
};

const n = (v: unknown) => Number(v ?? 0);
const div = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Inclusive day count between two ISO dates. */
function dayCount(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86400000)) + 1;
}

function toBreakdown(rows: Record<string, unknown>[]): BreakdownRow[] {
  const total = rows.reduce((s, r) => s + n(r.spend), 0);
  return rows.map((r) => {
    const spend = n(r.spend);
    const revenue = n(r.revenue);
    const impressions = n(r.impressions);
    const clicks = n(r.clicks);
    return {
      segment: String(r.segment),
      spend,
      revenue,
      roas: div(revenue, spend),
      purchases: n(r.conversions),
      clicks,
      impressions,
      ctr: div(clicks, impressions) * 100,
      share: div(spend, total) * 100,
    };
  });
}

export async function getReport(range: ReportRange): Promise<ReportData> {
  const { from, to } = range;

  const [totalsRow, adRows, ageRows, genderRows, ageGenderRows, regionRows, shopRow] =
    await timed("getReport", () =>
      Promise.all([
        sqlClient`
          select coalesce(sum(m.spend),0) spend, coalesce(sum(m.revenue),0) revenue,
                 coalesce(sum(m.impressions),0) impressions, coalesce(sum(m.clicks),0) clicks,
                 coalesce(sum(m.conversions),0) conversions,
                 count(distinct m.ad_id)::int ads
          from ad_metrics m
          where m.as_of_date between ${from} and ${to}`,

        sqlClient`
          select m.ad_id,
                 c.id as creative_id, c.title, t.label as type, a.label as angle, aa.status,
                 sum(m.spend) spend, sum(m.revenue) revenue,
                 sum(m.impressions) impressions, sum(m.clicks) clicks,
                 sum(m.conversions) conversions,
                 min(m.as_of_date)::text first_day, max(m.as_of_date)::text last_day,
                 count(*)::int days_active,
                 coalesce(s.tracked_revenue, 0) tracked_revenue,
                 coalesce(s.tracked_orders, 0) tracked_orders
          from ad_metrics m
          join ad_activations aa on aa.meta_ad_id = m.ad_id
          join creatives c on c.id = aa.creative_id
          join types t on t.id = c.type_id
          join angles a on a.id = c.angle_id
          left join (
            select ad_id, sum(revenue) tracked_revenue, sum(orders) tracked_orders
            from shopify_ad_revenue
            where as_of_date between ${from} and ${to}
            group by ad_id
          ) s on s.ad_id = m.ad_id
          where m.as_of_date between ${from} and ${to}
          group by m.ad_id, c.id, c.title, t.label, a.label, aa.status,
                   s.tracked_revenue, s.tracked_orders
          order by sum(m.spend) desc`,

        breakdown("age", from, to),
        breakdown("gender", from, to),
        breakdown("age_gender", from, to),
        // Region spend comes from Meta; region REVENUE from Shopify attribution,
        // because Meta returns none. Joined on the normalised region name.
        sqlClient`
          select d.segment,
                 sum(d.spend) spend,
                 coalesce(max(s.revenue), 0) revenue,
                 sum(d.impressions) impressions, sum(d.clicks) clicks,
                 coalesce(max(s.orders), 0) conversions
          from ad_demographic_metrics d
          left join (
            select region, sum(revenue) revenue, sum(orders) orders
            from shopify_ad_revenue
            where as_of_date between ${from} and ${to}
            group by region
          ) s on s.region = d.segment
          where d.dimension = 'region' and d.as_of_date between ${from} and ${to}
          group by d.segment
          order by sum(d.spend) desc`,

        sqlClient`
          select coalesce(sum(revenue),0) revenue, coalesce(sum(orders),0) orders
          from shopify_ad_revenue where as_of_date between ${from} and ${to}`,
      ]),
    );

  const t = totalsRow[0] as Record<string, unknown>;
  const spend = n(t.spend);
  const revenue = n(t.revenue);
  const impressions = n(t.impressions);
  const clicks = n(t.clicks);
  const purchases = n(t.conversions);

  return {
    range,
    totals: {
      spend,
      revenue,
      roas: div(revenue, spend),
      purchases,
      clicks,
      impressions,
      ctr: div(clicks, impressions) * 100,
      cpc: div(spend, clicks),
      cpm: div(spend, impressions) * 1000,
      cpa: div(spend, purchases),
      activeAds: n(t.ads),
      days: dayCount(from, to),
      trackedRevenue: n((shopRow[0] as Record<string, unknown>)?.revenue),
      trackedOrders: n((shopRow[0] as Record<string, unknown>)?.orders),
    },
    ads: adRows.map((r) => {
      const row = r as Record<string, unknown>;
      const s = n(row.spend);
      const rev = n(row.revenue);
      const imp = n(row.impressions);
      const clk = n(row.clicks);
      const conv = n(row.conversions);
      return {
        adId: String(row.ad_id),
        creativeId: String(row.creative_id),
        title: String(row.title),
        type: String(row.type),
        angle: String(row.angle),
        status: String(row.status),
        spend: s,
        revenue: rev,
        roas: div(rev, s),
        purchases: conv,
        clicks: clk,
        impressions: imp,
        ctr: div(clk, imp) * 100,
        cpa: div(s, conv),
        trackedRevenue: n(row.tracked_revenue),
        trackedOrders: n(row.tracked_orders),
        firstDay: String(row.first_day),
        lastDay: String(row.last_day),
        daysActive: n(row.days_active),
      };
    }),
    age: toBreakdown(ageRows as Record<string, unknown>[]),
    gender: toBreakdown(genderRows as Record<string, unknown>[]),
    ageGender: toBreakdown(ageGenderRows as Record<string, unknown>[]),
    region: toBreakdown(regionRows as Record<string, unknown>[]),
    hasShopify: n((shopRow[0] as Record<string, unknown>)?.orders) > 0,
  };
}

/** One demographic dimension summed over the range, across every ad. */
function breakdown(dimension: string, from: string, to: string) {
  return sqlClient`
    select segment,
           sum(spend) spend, sum(revenue) revenue,
           sum(impressions) impressions, sum(clicks) clicks,
           sum(conversions) conversions
    from ad_demographic_metrics
    where dimension = ${dimension} and as_of_date between ${from} and ${to}
    group by segment
    order by sum(spend) desc`;
}

/** Earliest and latest day we hold any metrics for — bounds the date picker. */
export async function getDataBounds(): Promise<{ min: string; max: string } | null> {
  const [r] = await sqlClient`
    select min(as_of_date)::text as min, max(as_of_date)::text as max from ad_metrics`;
  if (!r?.min) return null;
  return { min: String(r.min), max: String(r.max) };
}
