import "server-only";
import { sqlClient } from "@/lib/db";
import { creativeScore } from "@/lib/score";
import { timed } from "@/lib/perf";

/** One row per creative with its tags + summed (additive) metrics (§6 G1). */
export type DashCreative = {
  id: string;
  angle: string;
  type: string;
  subtype: string;
  personas: string[];
  spend: number;
  revenue: number;
  conversions: number;
};

export type DashboardKpis = {
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  liveAds: number;
};

export type CentralGroup = {
  persona: string;
  spend: number;
  roas: number;
  angle: string; // dominant angle for that persona (by spend)
  format: string; // winning format/type (by spend)
} | null;

export type DashboardData = {
  creatives: DashCreative[];
  kpis: DashboardKpis;
  central: CentralGroup;
};

export async function getDashboard(): Promise<DashboardData> {
  const rows = await timed("getDashboard", () => sqlClient`
    select c.id, a.label as angle, t.label as type, st.label as subtype,
           coalesce(string_agg(distinct p.label, '||') filter (where p.label is not null), '') as personas,
           coalesce(m.spend, 0) as spend, coalesce(m.revenue, 0) as revenue,
           coalesce(m.conversions, 0) as conversions
    from creatives c
    join angles a on a.id = c.angle_id
    join types t on t.id = c.type_id
    join subtypes st on st.id = c.subtype_id
    left join creative_personas cp on cp.creative_id = c.id
    left join personas p on p.id = cp.persona_id
    left join (
      select aa.creative_id,
             sum(md.spend) as spend, sum(md.revenue) as revenue, sum(md.conversions) as conversions
      from ad_activations aa
      join ad_metrics md on md.ad_id = aa.meta_ad_id
      group by aa.creative_id
    ) m on m.creative_id = c.id
    where c.status <> 'archived'
    group by c.id, a.label, t.label, st.label, m.spend, m.revenue, m.conversions
  `);

  const creatives: DashCreative[] = rows.map((r) => ({
    id: r.id as string,
    angle: r.angle as string,
    type: r.type as string,
    subtype: r.subtype as string,
    personas: r.personas ? String(r.personas).split("||").filter(Boolean) : [],
    spend: Number(r.spend) || 0,
    revenue: Number(r.revenue) || 0,
    conversions: Number(r.conversions) || 0,
  }));

  const [{ n: liveAds }] = (await sqlClient`
    select count(*)::int as n from ad_activations
  `) as unknown as { n: number }[];

  // KPIs — additive sums (§6).
  const spend = creatives.reduce((s, c) => s + c.spend, 0);
  const revenue = creatives.reduce((s, c) => s + c.revenue, 0);
  const conversions = creatives.reduce((s, c) => s + c.conversions, 0);
  const kpis: DashboardKpis = {
    spend,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    conversions,
    liveAds: Number(liveAds) || 0,
  };

  return { creatives, kpis, central: centralGroup(creatives) };
}

/**
 * Central Group (BUILD_GUIDE §8): the persona with the best spend-weighted ROAS at
 * meaningful scale — filter to personas above a spend floor, rank by roas × log(spend).
 * Personas are full-counted (a creative counts under each of its personas).
 */
function centralGroup(creatives: DashCreative[]): CentralGroup {
  type Agg = { spend: number; revenue: number; byAngle: Map<string, number>; byFormat: Map<string, number> };
  const personas = new Map<string, Agg>();

  for (const c of creatives) {
    for (const p of c.personas) {
      const a = personas.get(p) ?? { spend: 0, revenue: 0, byAngle: new Map(), byFormat: new Map() };
      a.spend += c.spend;
      a.revenue += c.revenue;
      a.byAngle.set(c.angle, (a.byAngle.get(c.angle) ?? 0) + c.spend);
      a.byFormat.set(c.type, (a.byFormat.get(c.type) ?? 0) + c.spend);
      personas.set(p, a);
    }
  }

  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  const floor = Math.max(totalSpend * 0.05, 1); // ≥5% of spend (and >0), at least ₹1
  const top = (key: Map<string, number>) =>
    [...key.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "—";

  let best: { persona: string; score: number; agg: Agg } | null = null;
  for (const [persona, agg] of personas) {
    if (agg.spend < floor) continue;
    const roas = agg.spend > 0 ? agg.revenue / agg.spend : 0;
    const rank = roas * Math.log(agg.spend + 1); // spend-weighted ROAS at scale
    if (!best || rank > best.score) best = { persona, score: rank, agg };
  }

  if (!best) return null;
  return {
    persona: best.persona,
    spend: best.agg.spend,
    roas: best.agg.spend > 0 ? best.agg.revenue / best.agg.spend : 0,
    angle: top(best.agg.byAngle),
    format: top(best.agg.byFormat),
  };
}

/** Re-export for the client tree builder. */
export { creativeScore };
