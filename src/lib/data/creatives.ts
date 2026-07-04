import "server-only";
import { sqlClient } from "@/lib/db";
import { creativeScore } from "@/lib/score";
import { timed } from "@/lib/perf";
import type { CreativeStatus } from "@/lib/status";

export type CreativeCard = {
  id: string;
  title: string;
  status: CreativeStatus;
  createdAt: string;
  type: string;
  subtype: string;
  angle: string;
  personas: string[];
  adCount: number;
  spend: number;
  revenue: number;
  roas: number;
  score: number;
  thumbPath: string | null; // first creative_files path (signed → URL in the page)
  thumbUrl?: string | null; // resolved signed URL (set in the page, not the query)
};

function toCard(r: Record<string, unknown>): CreativeCard {
  const spend = Number(r.spend ?? 0);
  const revenue = Number(r.revenue ?? 0);
  const roas = spend > 0 ? revenue / spend : 0;
  return {
    id: r.id as string,
    title: r.title as string,
    status: r.status as CreativeStatus,
    createdAt: String(r.created_at),
    type: r.type as string,
    subtype: r.subtype as string,
    angle: r.angle as string,
    personas: r.personas ? String(r.personas).split("||").filter(Boolean) : [],
    adCount: Number(r.ad_count ?? 0),
    spend,
    revenue,
    roas,
    score: creativeScore(spend, roas),
    thumbPath: (r.thumb_path as string | null) ?? null,
  };
}

/** All creatives as Library cards. Additive metrics summed; score on read (§6/§7). */
export async function listCreatives(): Promise<CreativeCard[]> {
  const rows = await timed("listCreatives", () => sqlClient`
    select c.id, c.title, c.status, c.created_at,
           t.label as type, st.label as subtype, a.label as angle,
           coalesce(string_agg(distinct p.label, '||') filter (where p.label is not null), '') as personas,
           (select count(*)::int from ad_activations aa where aa.creative_id = c.id) as ad_count,
           (select storage_path from creative_files cf where cf.creative_id = c.id order by position limit 1) as thumb_path,
           coalesce(m.spend, 0) as spend, coalesce(m.revenue, 0) as revenue
    from creatives c
    join types t on t.id = c.type_id
    join subtypes st on st.id = c.subtype_id
    join angles a on a.id = c.angle_id
    left join creative_personas cp on cp.creative_id = c.id
    left join personas p on p.id = cp.persona_id
    left join (
      select aa.creative_id, sum(md.spend) as spend, sum(md.revenue) as revenue
      from ad_activations aa
      join ad_metrics md on md.ad_id = aa.meta_ad_id
      group by aa.creative_id
    ) m on m.creative_id = c.id
    group by c.id, t.label, st.label, a.label, m.spend, m.revenue
    order by c.created_at desc
  `);
  return rows.map((r) => toCard(r as Record<string, unknown>));
}

export type LinkedAd = {
  metaAdId: string;
  campaignId: string | null;
  adsetId: string | null;
  placement: string | null;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
};

export type CreativeDetail = {
  id: string;
  title: string;
  status: CreativeStatus;
  createdAt: string;
  uploadedBy: string;
  type: string;
  subtype: string;
  angle: string;
  awareness: string | null;
  hook: string | null;
  personas: string[];
  reviewLink: string;
  reviewSummary: string;
  files: { storagePath: string; position: number; url?: string | null }[];
  ads: LinkedAd[];
};

export async function getCreativeDetail(id: string): Promise<CreativeDetail | null> {
  const [c] = await sqlClient`
    select c.*, t.label as type, st.label as subtype, a.label as angle,
           aw.label as awareness, h.label as hook, u.name as uploaded_by_name
    from creatives c
    join types t on t.id = c.type_id
    join subtypes st on st.id = c.subtype_id
    join angles a on a.id = c.angle_id
    left join awareness_stages aw on aw.id = c.awareness_id
    left join hook_types h on h.id = c.hook_id
    join users u on u.id = c.uploaded_by
    where c.id = ${id}
  `;
  if (!c) return null;

  const personaRows = await sqlClient`
    select p.label from creative_personas cp join personas p on p.id = cp.persona_id
    where cp.creative_id = ${id} order by p.label`;
  const fileRows = await sqlClient`
    select storage_path, position from creative_files where creative_id = ${id} order by position`;
  const adRows = await sqlClient`
    select aa.meta_ad_id, aa.campaign_id, aa.adset_id, aa.placement, aa.status,
           coalesce(sum(md.spend),0) as spend, coalesce(sum(md.revenue),0) as revenue
    from ad_activations aa
    left join ad_metrics md on md.ad_id = aa.meta_ad_id
    where aa.creative_id = ${id}
    group by aa.meta_ad_id, aa.campaign_id, aa.adset_id, aa.placement, aa.status
    order by aa.meta_ad_id`;

  return {
    id: c.id,
    title: c.title,
    status: c.status,
    createdAt: String(c.created_at),
    uploadedBy: c.uploaded_by_name,
    type: c.type,
    subtype: c.subtype,
    angle: c.angle,
    awareness: c.awareness,
    hook: c.hook,
    personas: personaRows.map((r) => r.label),
    reviewLink: c.review_link,
    reviewSummary: c.review_summary,
    files: fileRows.map((f) => ({ storagePath: f.storage_path, position: f.position })),
    ads: adRows.map((r) => {
      const spend = Number(r.spend);
      const revenue = Number(r.revenue);
      return {
        metaAdId: r.meta_ad_id,
        campaignId: r.campaign_id,
        adsetId: r.adset_id,
        placement: r.placement,
        status: r.status,
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
      };
    }),
  };
}

/** Creatives with no linked ad and status ≠ archived (Awaiting Linking, README §8). */
export async function getAwaiting(): Promise<CreativeCard[]> {
  return (await listCreatives()).filter(
    (c) => c.adCount === 0 && c.status !== "archived",
  );
}

export type AdFrameData = {
  adId: string;
  campaignId: string | null;
  adsetId: string | null;
  placement: string | null;
  status: string;
  lastSyncedAt: string | null;
  creative: { id: string; title: string; type: string };
  lifetime: {
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    reach: number;
    frequency: number;
  };
  daily: {
    asOfDate: string;
    spend: number;
    revenue: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    thumbstop: number | null;
    hold: number | null;
  }[];
  range: {
    last7: { reach: number; frequency: number };
    prior7: { reach: number; frequency: number };
  };
  log: { author: string; text: string; createdAt: string }[];
};

export async function getAdFrame(adId: string): Promise<AdFrameData | null> {
  const [aa] = await sqlClient`
    select aa.*, c.id as creative_id, c.title, t.label as type
    from ad_activations aa
    join creatives c on c.id = aa.creative_id
    join types t on t.id = c.type_id
    where aa.meta_ad_id = ${adId}`;
  if (!aa) return null;

  const [life] = await sqlClient`
    select coalesce(sum(spend),0) spend, coalesce(sum(revenue),0) revenue,
           coalesce(sum(impressions),0) impressions, coalesce(sum(clicks),0) clicks,
           coalesce(sum(conversions),0) conversions
    from ad_metrics where ad_id = ${adId}`;
  const ranges = await sqlClient`
    select range, reach, frequency from ad_range_metrics where ad_id = ${adId}`;
  // Calendar-continuous last 14 days ending today. Meta only returns rows for days
  // the ad delivered, so a paused ad has gaps — fill them with zeros so "Last 7 days"
  // reflects real calendar days (a recently-paused ad reads as a flat zero tail,
  // matching its de-duplicated reach going to 0). Chronological (oldest → newest).
  const daily = await sqlClient`
    select to_char(days.d, 'YYYY-MM-DD') as as_of_date,
           coalesce(m.spend, 0) as spend,
           coalesce(m.revenue, 0) as revenue,
           coalesce(m.impressions, 0) as impressions,
           coalesce(m.reach, 0) as reach,
           coalesce(m.clicks, 0) as clicks,
           coalesce(m.conversions, 0) as conversions,
           m.thumbstop, m.hold
    from generate_series((current_date - interval '13 days')::date, current_date, interval '1 day') as days(d)
    left join ad_metrics m on m.ad_id = ${adId} and m.as_of_date = days.d
    order by days.d asc`;
  const log = await sqlClient`
    select l.text, l.created_at, u.name as author
    from ad_decision_log l join users u on u.id = l.author_id
    where l.ad_id = ${adId} order by l.created_at desc`;

  const rng = (k: string) => ranges.find((r) => r.range === k);
  const lifetimeReach = rng("lifetime");

  return {
    adId: aa.meta_ad_id,
    campaignId: aa.campaign_id,
    adsetId: aa.adset_id,
    placement: aa.placement,
    status: aa.status,
    lastSyncedAt: aa.last_synced_at ? String(aa.last_synced_at) : null,
    creative: { id: aa.creative_id, title: aa.title, type: aa.type },
    lifetime: {
      spend: Number(life.spend),
      revenue: Number(life.revenue),
      impressions: Number(life.impressions),
      clicks: Number(life.clicks),
      conversions: Number(life.conversions),
      reach: Number(lifetimeReach?.reach ?? 0),
      frequency: Number(lifetimeReach?.frequency ?? 0),
    },
    daily: daily
      .map((d) => ({
        asOfDate: String(d.as_of_date),
        spend: Number(d.spend),
        revenue: Number(d.revenue),
        impressions: Number(d.impressions),
        reach: Number(d.reach),
        clicks: Number(d.clicks),
        conversions: Number(d.conversions),
        thumbstop: d.thumbstop === null ? null : Number(d.thumbstop),
        hold: d.hold === null ? null : Number(d.hold),
      })),
    range: {
      last7: {
        reach: Number(rng("last_7")?.reach ?? 0),
        frequency: Number(rng("last_7")?.frequency ?? 0),
      },
      prior7: {
        reach: Number(rng("prior_7")?.reach ?? 0),
        frequency: Number(rng("prior_7")?.frequency ?? 0),
      },
    },
    log: log.map((l) => ({
      author: l.author,
      text: l.text,
      createdAt: String(l.created_at),
    })),
  };
}
