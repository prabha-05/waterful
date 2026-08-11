"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdFrameData } from "@/lib/data/creatives";
import type { Permissions } from "@/lib/auth/permissions";
import { lifetimeDerived, recommendation } from "@/lib/ad-metrics";
import { formatInt, formatRoas } from "@/lib/format";
import { addDecisionLog, unlinkAd } from "@/app/actions/creatives";
import { Button, Chip } from "@/components/ui/primitives";
import { useDate, useFormat } from "@/components/providers/settings-provider";

const BANNER_TONE: Record<string, string> = {
  positive: "bg-green-bg text-green",
  warn: "bg-amber-bg text-amber",
  paused: "bg-red-bg text-red",
  neutral: "bg-brand-chip text-brand-deep",
};

type WinKey = 7 | 15 | 30 | "all";
const WIN_KEYS: WinKey[] = [7, 15, 30, "all"];

type Daily = AdFrameData["daily"][number];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (iso: string, by: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + by);
  return ymd(d);
};
const zeroDay = (asOfDate: string): Daily => ({
  asOfDate, spend: 0, revenue: 0, impressions: 0, reach: 0,
  clicks: 0, conversions: 0, thumbstop: null, hold: null,
});

/**
 * Calendar window: every date from..to inclusive, filling days the ad didn't
 * deliver with zeros (Meta returns no row at all for those). So "Last 15 days"
 * always plots 15 points — the flat stretches ARE the story (paused, budget
 * exhausted) instead of a chart that silently looks short.
 */
function calendarWindow(daily: Daily[], from: string, to: string): Daily[] {
  if (from > to) return [];
  const byDate = new Map(daily.map((d) => [d.asOfDate, d]));
  const out: Daily[] = [];
  for (let day = from; day <= to; day = shiftDays(day, 1)) {
    out.push(byDate.get(day) ?? zeroDay(day));
  }
  return out;
}

/** Lifetime = first→last delivery span (its actual run), in days. */
function lifetimeSpan(daily: Daily[]): number {
  if (daily.length === 0) return 0;
  const first = daily[0].asOfDate;
  const last = daily[daily.length - 1].asOfDate;
  return Math.round(
    (new Date(`${last}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime()) / 86400000,
  ) + 1;
}

function winLabels(daily: Daily[]): { key: WinKey; label: string; short: string }[] {
  const span = lifetimeSpan(daily);
  return WIN_KEYS.map((key) => {
    if (key === "all") {
      return {
        key,
        label: `Lifetime · ran ${span} day${span === 1 ? "" : "s"}`,
        short: `Lifetime (${span}d)`,
      };
    }
    return { key, label: `Last ${key} days`, short: `Last ${key} days` };
  });
}

export function AdFrame({ data, perms }: { data: AdFrameData; perms: Permissions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fmt = useFormat();
  const fmtDate = useDate();
  const rec = recommendation(data);
  const d = lifetimeDerived(data.lifetime);

  // Selected trend window (7 / 15 / 30 days or lifetime), re-windowed client-side
  // from the full daily history.
  const [win, setWin] = useState<WinKey>(7);
  const windows = winLabels(data.daily);
  const winLabel = windows.find((w) => w.key === win)!.label;

  // Windows END on the ad's last delivery day, not today — for a paused ad that
  // means its final active week/fortnight rather than a flat line of zeros
  // stretching to now. Within the window, days it didn't deliver are real zeros
  // (Meta omits those rows), so the gaps stay visible.
  const today = ymd(new Date());
  const lastActive = data.daily.length ? data.daily[data.daily.length - 1].asOfDate : today;
  const isStale = lastActive < today;
  const { cur, prior } = (() => {
    if (win === "all") {
      if (data.daily.length === 0) return { cur: [] as Daily[], prior: [] as Daily[] };
      return {
        cur: calendarWindow(data.daily, data.daily[0].asOfDate, lastActive),
        prior: [] as Daily[],
      };
    }
    const from = shiftDays(lastActive, -(win - 1));
    return {
      cur: calendarWindow(data.daily, from, lastActive),
      prior: calendarWindow(data.daily, shiftDays(from, -win), shiftDays(from, -1)),
    };
  })();
  const daysWithDelivery = cur.filter((r) => r.spend > 0 || r.impressions > 0).length;
  // Reach/frequency are de-duplicated by Meta and NOT summable — exact only for
  // 7-day and lifetime; 15/30 fall back to an approximation (marked with ~).
  const approxReach = win === 15 || win === 30;

  const sumK = (rows: typeof cur, k: keyof (typeof cur)[number]) =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const delta = (now: number, prev: number) => (prev > 0 ? ((now - prev) / prev) * 100 : 0);

  const isVideo = data.creative.type === "Video";
  const avg = (k: "thumbstop" | "hold") => {
    const vals = data.daily.map((x) => x[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  // Lifetime KPI grid (14 metrics, README/§7 G6). reach/frequency from range table (G1).
  const kpis: { label: string; value: string }[] = [
    { label: "Spend", value: fmt(data.lifetime.spend) },
    { label: "Revenue", value: fmt(data.lifetime.revenue) },
    { label: "ROAS", value: formatRoas(d.roas) },
    { label: "Impressions", value: formatInt(data.lifetime.impressions) },
    { label: "Reach", value: formatInt(data.lifetime.reach) },
    { label: "Frequency", value: d.frequency.toFixed(2) },
    { label: "Clicks", value: formatInt(data.lifetime.clicks) },
    { label: "Conversions", value: formatInt(data.lifetime.conversions) },
    { label: "CTR", value: `${d.ctr.toFixed(2)}%` },
    { label: "CPM", value: fmt(d.cpm) },
    { label: "CPC", value: fmt(d.cpc) },
    { label: "CPA", value: data.lifetime.conversions > 0 ? fmt(d.cpa) : "—" },
    { label: "Thumbstop", value: isVideo && avg("thumbstop") !== null ? `${(avg("thumbstop")! * 100).toFixed(1)}%` : "No data" },
    { label: "Hold", value: isVideo && avg("hold") !== null ? `${(avg("hold")! * 100).toFixed(1)}%` : "No data" },
  ];

  // Compact point labels (Indian-style magnitudes, matches formatCurrency tiers).
  const compact = (v: number) => {
    const a = Math.abs(v);
    const t = (x: number) => x.toFixed(x % 1 === 0 ? 0 : 1).replace(/\.0$/, "");
    if (a >= 1e7) return `${t(v / 1e7)}Cr`;
    if (a >= 1e5) return `${t(v / 1e5)}L`;
    if (a >= 1e3) return `${t(v / 1e3)}k`;
    return t(v);
  };

  const dates = cur.map((r) => r.asOfDate);
  const roasCur = sumK(cur, "revenue") / Math.max(1, sumK(cur, "spend"));

  // Windowed reach/frequency: exact from Meta's de-duplicated ranges for 7-day
  // and lifetime; a summed approximation (~) for 15/30 where no de-duped value
  // exists. Prior period is empty for lifetime, so its delta is 0.
  const reachNow = win === 7 ? data.range.last7.reach : win === "all" ? data.lifetime.reach : sumK(cur, "reach");
  const reachPrior = win === 7 ? data.range.prior7.reach : sumK(prior, "reach");
  const freqNow = win === 7 ? data.range.last7.frequency : win === "all" ? data.lifetime.frequency : sumK(cur, "impressions") / Math.max(1, sumK(cur, "reach"));
  const freqPrior = win === 7 ? data.range.prior7.frequency : sumK(prior, "impressions") / Math.max(1, sumK(prior, "reach"));
  const tilde = approxReach ? "~" : "";

  // Mini-graphs for the selected window, with current-vs-prior-period deltas.
  // `good` = is an increase good? `headline` = period total/value, `format` = per-day labels.
  const graphs: { label: string; series: number[]; delta: number; good: boolean; headline: string; format: (v: number) => string }[] = [
    { label: "Spend", series: cur.map((r) => r.spend), delta: delta(sumK(cur, "spend"), sumK(prior, "spend")), good: true, headline: fmt(sumK(cur, "spend")), format: fmt },
    { label: "Revenue", series: cur.map((r) => r.revenue), delta: delta(sumK(cur, "revenue"), sumK(prior, "revenue")), good: true, headline: fmt(sumK(cur, "revenue")), format: fmt },
    { label: "Impressions", series: cur.map((r) => r.impressions), delta: delta(sumK(cur, "impressions"), sumK(prior, "impressions")), good: true, headline: formatInt(sumK(cur, "impressions")), format: compact },
    { label: "Clicks", series: cur.map((r) => r.clicks), delta: delta(sumK(cur, "clicks"), sumK(prior, "clicks")), good: true, headline: formatInt(sumK(cur, "clicks")), format: compact },
    { label: "Conversions", series: cur.map((r) => r.conversions), delta: delta(sumK(cur, "conversions"), sumK(prior, "conversions")), good: true, headline: formatInt(sumK(cur, "conversions")), format: compact },
    { label: "ROAS", series: cur.map((r) => (r.spend > 0 ? r.revenue / r.spend : 0)), delta: delta(roasCur, sumK(prior, "revenue") / Math.max(1, sumK(prior, "spend"))), good: true, headline: formatRoas(roasCur), format: (v) => `${v.toFixed(1)}×` },
    { label: "CPM", series: cur.map((r) => (r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0)), delta: delta(sumK(cur, "spend") / Math.max(1, sumK(cur, "impressions")), sumK(prior, "spend") / Math.max(1, sumK(prior, "impressions"))), good: false, headline: fmt((sumK(cur, "spend") / Math.max(1, sumK(cur, "impressions"))) * 1000), format: fmt },
    { label: "Reach", series: cur.map((r) => r.reach), delta: delta(reachNow, reachPrior), good: true, headline: tilde + formatInt(reachNow), format: compact },
    { label: "Frequency", series: cur.map((r) => (r.reach > 0 ? r.impressions / r.reach : 0)), delta: delta(freqNow, freqPrior), good: false, headline: tilde + freqNow.toFixed(2), format: (v) => v.toFixed(2) },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-7 py-4">
        <button onClick={() => router.back()} className="text-sm font-medium text-brand hover:underline">← Back</button>
        <div className="ml-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ink">{data.adId}</span>
            <Chip className="bg-surface-2 text-ink-3">{data.status}</Chip>
          </div>
          <div className="text-[11px] text-muted">
            {data.campaignId} · {data.adsetId} · {data.placement} · Synced from Meta · read-only
            {data.lastSyncedAt && ` · last synced ${fmtDate(data.lastSyncedAt)}`}
          </div>
        </div>
        {perms.unlink && (
          <Button
            variant="danger"
            className="ml-auto"
            disabled={pending}
            onClick={() => startTransition(async () => { const r = await unlinkAd(data.adId); if (r.ok) router.push("/library"); })}
          >
            Unlink Ad ID
          </Button>
        )}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto p-4 sm:p-7 lg:grid-cols-[1fr_340px]">
        {/* Left — banner + KPIs + 7-day graphs */}
        <div className="flex flex-col gap-5">
          <div className={`rounded-[var(--radius-card)] px-4 py-3 text-sm font-medium ${BANNER_TONE[rec.tone]}`}>
            {rec.text}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Lifetime</h3>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted">{k.label}</div>
                  <div className="font-mono text-sm font-semibold text-ink">{k.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">{winLabel}</h3>
                {/* Charts plot every calendar day in the window; days with no
                    delivery are real zeros. Spell out how many actually ran. */}
                <p className="text-[11px] text-muted">
                  {cur.length === 0
                    ? "No delivery recorded"
                    : `${fmtDate(cur[0].asOfDate)} – ${fmtDate(cur[cur.length - 1].asOfDate)} · delivered on ${daysWithDelivery} of ${cur.length} day${cur.length === 1 ? "" : "s"}`}
                  {isStale && cur.length > 0 && " · last active period (ad has since stopped)"}
                </p>
              </div>
              <select
                value={String(win)}
                onChange={(e) => setWin(e.target.value === "all" ? "all" : (Number(e.target.value) as WinKey))}
                className="rounded-[var(--radius-control)] border border-[var(--control-border)] bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand"
              >
                {windows.map((w) => (
                  <option key={String(w.key)} value={String(w.key)}>{w.short}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {graphs.map((g) => (
                <Sparkline key={g.label} dates={dates} {...g} />
              ))}
            </div>
            {approxReach && (
              <p className="mt-2 text-[11px] text-muted">
                ~ Reach &amp; Frequency for {win}-day are approximate — Meta only reports exact de-duplicated reach for 7-day and lifetime.
              </p>
            )}
          </section>

          {data.demographics.length > 0 && (
            <AudienceBreakdown
              demographics={data.demographics}
              regionRevenue={data.regionRevenue}
              trackedRevenue={data.trackedRevenue}
            />
          )}
        </div>

        {/* Right — decision log */}
        <DecisionLog adId={data.adId} log={data.log} canLog={perms.log} onAdded={() => router.refresh()} />
      </div>
    </div>
  );
}

function Sparkline({
  label,
  series,
  dates,
  delta,
  good,
  headline,
  format,
}: {
  label: string;
  series: number[];
  dates: string[];
  delta: number;
  good: boolean;
  headline: string;
  format: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  // Room above the line for value labels, below for date labels, at the sides
  // so the edge labels don't clip.
  const w = 300, h = 96, padX = 22, padTop = 16, padBottom = 16;
  const coords = series.map((v, i) => ({
    x: padX + (i / Math.max(1, series.length - 1)) * (w - 2 * padX),
    y: padTop + (h - padTop - padBottom) * (1 - (v - min) / range),
  }));
  const pts = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const up = delta >= 0;
  const positive = up === good;
  const anchor = (i: number) => (i === 0 ? "start" : i === series.length - 1 ? "end" : "middle");
  // Thin labels so wider windows (15/30/lifetime) stay readable — keep ends and
  // ~7 evenly spaced points.
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const showLabel = (i: number) => i === 0 || i === series.length - 1 || i % labelEvery === 0;
  const shortDate = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
  };
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className={`text-xs font-medium ${positive ? "text-green" : "text-red"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
        </span>
      </div>
      <div className="mt-0.5 font-mono text-base font-semibold text-ink">{headline}</div>
      {/* Uniform scaling (default preserveAspectRatio) + auto height keeps day dots round. */}
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full">
        <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={active === i ? 3 : series.length > 20 ? 1.6 : 2.2}
              fill={active === i ? "var(--brand-deep)" : "var(--brand)"} />
            {showLabel(i) && active !== i && (
              <>
                <text x={c.x} y={c.y - 6} textAnchor={anchor(i)} fontSize="9" fill="var(--ink-2)" fontFamily="ui-monospace, monospace">
                  {format(series[i])}
                </text>
                <text x={c.x} y={h - 3} textAnchor={anchor(i)} fontSize="8.5" fill="var(--muted)">
                  {shortDate(dates[i])}
                </text>
              </>
            )}
            {/* invisible wide hit target — hover or tap any point for its date + value */}
            <circle cx={c.x} cy={c.y} r="9" fill="transparent" style={{ cursor: "pointer" }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onClick={() => setActive((p) => (p === i ? null : i))} />
          </g>
        ))}
        {active !== null && (() => {
          const c = coords[active];
          const l1 = shortDate(dates[active]);
          const l2 = format(series[active]);
          const tw = Math.max(l1.length, l2.length) * 5.4 + 12;
          const tx = Math.min(Math.max(c.x - tw / 2, 1), w - tw - 1);
          const ty = c.y - 30 < 1 ? c.y + 8 : c.y - 30;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={26} rx="4" fill="var(--surface)" stroke="var(--line)" />
              <text x={tx + tw / 2} y={ty + 10} textAnchor="middle" fontSize="8" fill="var(--muted)">{l1}</text>
              <text x={tx + tw / 2} y={ty + 20} textAnchor="middle" fontSize="9.5" fill="var(--ink)" fontFamily="ui-monospace, monospace">{l2}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/** Audience sections — who this creative actually reached (stacked, no tabs). */
const AUDIENCE_DIMS: { key: string; label: string; note?: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "age_gender", label: "Age × Gender" },
  { key: "region", label: "Region", note: "spend and reach only — Meta reports no revenue by region" },
];

// Age buckets read better in order; regions rank by spend.
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown", "unknown"];
const GENDER_ORDER = ["female", "male", "unknown"];
const AUD_GRID = "grid-cols-[minmax(100px,1fr)_minmax(150px,220px)_90px_90px_70px]";
const AUD_GRID_NOREV = "grid-cols-[minmax(110px,1fr)_150px_90px_110px]";
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");


const genderOf = (segment: string) => segment.split(" ").slice(-1)[0].toLowerCase();
const ageOf = (segment: string) => segment.split(" ")[0];

function AudienceBreakdown({
  demographics,
  regionRevenue,
  trackedRevenue,
}: {
  demographics: AdFrameData["demographics"];
  regionRevenue: AdFrameData["regionRevenue"];
  trackedRevenue: AdFrameData["trackedRevenue"];
}) {
  const present = AUDIENCE_DIMS.filter(
    (d) =>
      demographics.some((x) => x.dimension === d.key) ||
      // Region stands on its own: Shopify knows where the orders came from even
      // when Meta has given us no demographic rows for this ad.
      (d.key === "region" && regionRevenue.length > 0),
  );
  if (present.length === 0) return null;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">Audience breakdown</h3>
        <p className="text-[11px] text-muted">who this creative actually reached</p>
      </div>
      {present.map((dim) => (
        <AudienceTable
          key={dim.key}
          dim={dim}
          demographics={demographics}
          regionRevenue={regionRevenue}
          trackedRevenue={trackedRevenue}
        />
      ))}
    </section>
  );
}

function AudienceTable({
  dim,
  demographics,
  regionRevenue,
  trackedRevenue,
}: {
  dim: { key: string; label: string; note?: string };
  demographics: AdFrameData["demographics"];
  regionRevenue: AdFrameData["regionRevenue"];
  trackedRevenue: AdFrameData["trackedRevenue"];
}) {
  const fmt = useFormat();
  const isRegion = dim.key === "region";
  // Meta gives no revenue by region, so region revenue comes from Shopify
  // orders tagged with this ad's id. Present only once the store is connected.
  const adRev = isRegion && regionRevenue.length > 0 ? regionRevenue : null;
  const hasRevenue = !isRegion || adRev !== null;
  const revByRegion = new Map(regionRevenue.map((r) => [r.region, r]));

  const base = demographics.filter((d) => d.dimension === dim.key);
  // Region rows arrive from Meta with revenue 0 — graft on the real number, and
  // add any state that produced orders but has no Meta spend row of its own.
  const merged = isRegion
    ? [
        ...base.map((d) => ({ ...d, revenue: revByRegion.get(d.segment)?.revenue ?? 0 })),
        ...regionRevenue
          .filter((r) => !base.some((d) => d.segment === r.region))
          .map((r) => ({
            dimension: "region",
            segment: r.region,
            spend: 0,
            revenue: r.revenue,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            reach: 0,
          })),
      ]
    : base;

  const rows = merged
    .sort((a, b) => {
      if (dim.key === "age") return AGE_ORDER.indexOf(a.segment) - AGE_ORDER.indexOf(b.segment);
      // Age × Gender: keep the genders apart, ages in order inside each — the
      // point is comparing like with like, not one interleaved spend ranking.
      if (dim.key === "age_gender") {
        const g = GENDER_ORDER.indexOf(genderOf(a.segment)) - GENDER_ORDER.indexOf(genderOf(b.segment));
        return g !== 0 ? g : AGE_ORDER.indexOf(ageOf(a.segment)) - AGE_ORDER.indexOf(ageOf(b.segment));
      }
      return b.spend - a.spend || b.revenue - a.revenue;
    })
    .slice(0, dim.key === "region" ? 12 : 24);
  if (rows.length === 0) return null;

  // Both bars share one scale so their lengths are directly comparable: a
  // revenue bar shorter than its spend bar IS the loss, visible at a glance.
  const scaleMax = Math.max(...rows.map((r) => Math.max(r.spend, hasRevenue ? r.revenue : 0)), 1);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-ink-2">
          {dim.label}
          {dim.key === "region" && rows.length === 12 && (
            <span className="ml-1 font-normal text-muted">· top 12 states</span>
          )}
        </h4>
        {hasRevenue ? (
          <span className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <i className="inline-block h-[7px] w-3 rounded-sm bg-brand" /> spend
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-[7px] w-3 rounded-sm bg-green" /> revenue
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-muted">{dim.note}</span>
        )}
      </div>

      {adRev && trackedRevenue && (
        // Be explicit that this is measured last-click, not Meta's modelled
        // number — the two will not agree, and the gap is the point.
        <p className="mb-1.5 text-[11px] leading-relaxed text-muted">
          Revenue is <strong className="font-medium text-ink-3">real Shopify orders tagged with this ad</strong> —{" "}
          {formatInt(trackedRevenue.orders)} order{trackedRevenue.orders === 1 ? "" : "s"} worth{" "}
          {fmt(trackedRevenue.revenue)}. Last-click only: orders that lost the tracking link are not counted, so
          read this as the floor and Meta&apos;s figure as the ceiling.
          {rows.every((r) => r.spend === 0) && (
            <> Per-state spend is missing until the next Meta sync runs.</>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-surface">
        <div className="min-w-[520px]">
          <div
            className={join(
              "grid items-center gap-3 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted",
              hasRevenue ? AUD_GRID : AUD_GRID_NOREV,
            )}
          >
            <span>{dim.label}</span>
            <span>{hasRevenue ? "Spend vs revenue" : "Spend share"}</span>
            <span className="text-right">Spend</span>
            {hasRevenue ? (
              <>
                <span className="text-right">Revenue</span>
                <span className="text-right">ROAS</span>
              </>
            ) : (
              <span className="text-right">Impressions</span>
            )}
          </div>

          {rows.map((r, i) => {
            const roas = r.spend > 0 ? r.revenue / r.spend : 0;
            const tone = roas >= 1.3 ? "text-green" : roas >= 1 ? "text-amber" : "text-red";
            // Gender divider + subtotal when the group changes (Age × Gender only).
            const gender = dim.key === "age_gender" ? genderOf(r.segment) : null;
            const newGroup = gender !== null && (i === 0 || genderOf(rows[i - 1].segment) !== gender);
            const groupRows = gender ? rows.filter((x) => genderOf(x.segment) === gender) : [];
            const gSpend = groupRows.reduce((s, x) => s + x.spend, 0);
            const gRev = groupRows.reduce((s, x) => s + x.revenue, 0);
            const label = dim.key === "age_gender" ? ageOf(r.segment) : r.segment;

            const regionOrders = isRegion ? (revByRegion.get(r.segment)?.orders ?? 0) : 0;

            return (
              <div key={r.segment} className="contents">
                {newGroup && (
                  <div className="flex items-baseline justify-between gap-2 border-b border-line-2 bg-surface-2 px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{gender}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {fmt(gSpend)} spend · {fmt(gRev)} revenue ·{" "}
                      <span className={gSpend > 0 && gRev / gSpend >= 1 ? "text-green" : "text-red"}>
                        {gSpend > 0 ? formatRoas(gRev / gSpend) : "—"}
                      </span>
                    </span>
                  </div>
                )}
                <div
                  className={join(
                    "grid items-center gap-3 border-b border-line-2 px-4 py-2.5 text-sm last:border-0",
                    hasRevenue ? AUD_GRID : AUD_GRID_NOREV,
                  )}
                >
                  <span className="truncate font-medium capitalize text-ink">{label}</span>
                  {hasRevenue ? (
                    // Paired bars: spend above, revenue below, same scale. Revenue
                    // is green when it clears spend, red when it doesn't.
                    <div className="flex w-full flex-col gap-[3px]">
                      <div className="h-[7px] w-full overflow-hidden rounded-sm bg-line-2">
                        <div
                          className="h-full rounded-sm bg-brand"
                          style={{ width: `${Math.min(100, (r.spend / scaleMax) * 100)}%` }}
                          title={`Spend ${fmt(r.spend)}`}
                        />
                      </div>
                      <div className="h-[7px] w-full overflow-hidden rounded-sm bg-line-2">
                        <div
                          className="h-full rounded-sm bg-green"
                          style={{ width: `${Math.min(100, (r.revenue / scaleMax) * 100)}%` }}
                          title={`Revenue ${fmt(r.revenue)}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-2">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (r.spend / scaleMax) * 100)}%` }}
                      />
                    </div>
                  )}
                  <span className="text-right font-mono text-ink">{fmt(r.spend)}</span>
                  {hasRevenue ? (
                    <>
                      <span
                        className="text-right font-mono text-ink-3"
                        title={isRegion ? `${regionOrders} tracked order${regionOrders === 1 ? "" : "s"}` : undefined}
                      >
                        {fmt(r.revenue)}
                      </span>
                      <span className={`text-right font-mono ${tone}`}>
                        {r.spend > 0 ? formatRoas(roas) : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="text-right font-mono text-ink-3">{formatInt(r.impressions)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DecisionLog({
  adId,
  log,
  canLog,
  onAdded,
}: {
  adId: string;
  log: AdFrameData["log"];
  canLog: boolean;
  onAdded: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const fmtDate = useDate();

  function add() {
    startTransition(async () => {
      const r = await addDecisionLog(adId, text);
      if (r.ok) { setText(""); onAdded(); }
    });
  }

  return (
    <aside className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Decision log</div>
      {canLog ? (
        <div className="border-b border-line p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you change in Ads Manager, and why?"
            className="min-h-16 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-surface p-2 text-sm text-ink outline-none focus:border-brand"
          />
          <div className="mt-2 flex justify-end">
            <Button disabled={pending || !text.trim()} onClick={add}>{pending ? "Saving…" : "Add entry"}</Button>
          </div>
        </div>
      ) : (
        <div className="border-b border-line p-3 text-xs text-muted">Read-only — you don&apos;t have log permission.</div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {log.length === 0 ? (
          <p className="text-sm text-muted">No entries yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {log.map((e, i) => (
              <li key={i} className="border-b border-line-2 pb-3 last:border-0">
                <div className="text-[11px] text-muted">{fmtDate(e.createdAt)} · {e.author}</div>
                <p className="mt-0.5 text-sm text-ink-2">{e.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
