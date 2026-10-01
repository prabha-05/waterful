"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BreakdownRow, LandingRow, ReportData } from "@/lib/data/reports";
import { formatInt, formatRoas } from "@/lib/format";
import { useFormat } from "@/components/providers/settings-provider";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Age buckets read better in order; everything else ranks by spend.
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown", "Unknown"];
const GENDER_ORDER = ["female", "male", "unknown"];
const genderOf = (s: string) => s.split(" ").slice(-1)[0].toLowerCase();
const ageOf = (s: string) => s.split(" ")[0];

export function ReportsClient({
  data,
  bounds,
}: {
  data: ReportData;
  bounds: { min: string; max: string } | null;
}) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);

  const apply = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    startTransition(() => {
      router.push(`/reports?from=${nextFrom}&to=${nextTo}`, { scroll: false });
    });
  };

  const t = data.totals;
  const kpis = [
    { label: "Spend", value: fmt(t.spend) },
    { label: "Revenue", value: fmt(t.revenue) },
    { label: "ROAS", value: formatRoas(t.roas), tone: t.roas >= 1.3 ? "text-green" : t.roas >= 1 ? "text-amber" : "text-red" },
    { label: "Purchases", value: formatInt(t.purchases) },
    { label: "Clicks", value: formatInt(t.clicks) },
    { label: "CTR", value: `${t.ctr.toFixed(2)}%` },
    { label: "Impressions", value: formatInt(t.impressions) },
    { label: "CPC", value: fmt(t.cpc) },
    { label: "CPM", value: fmt(t.cpm) },
    { label: "CPA", value: t.purchases > 0 ? fmt(t.cpa) : "—" },
  ];

  return (
    <div className={`flex flex-col gap-6 p-4 md:p-6 ${pending ? "opacity-60 transition-opacity" : ""}`}>
      {/* ---- range picker ---------------------------------------------- */}
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">From</span>
            <input
              type="date"
              value={from}
              min={bounds?.min}
              max={to}
              onChange={(e) => apply(e.target.value, to)}
              className="rounded-[var(--radius-control)] border border-line-2 bg-surface-2 px-3 py-2 text-sm text-ink [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={bounds?.max}
              onChange={(e) => apply(from, e.target.value)}
              className="rounded-[var(--radius-control)] border border-line-2 bg-surface-2 px-3 py-2 text-sm text-ink [color-scheme:dark]"
            />
          </label>
        </div>

        <p className="mt-3 text-[11px] text-muted">
          {t.days} day{t.days === 1 ? "" : "s"} · {formatInt(t.activeAds)} ad
          {t.activeAds === 1 ? "" : "s"} delivered in this range
          {bounds && (
            <>
              {" "}
              · data available {bounds.min} → {bounds.max}
            </>
          )}
        </p>
      </section>

      {/* ---- headline numbers ------------------------------------------ */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{k.label}</div>
            <div className={`mt-1 font-mono text-xl ${k.tone ?? "text-ink"}`}>{k.value}</div>
          </div>
        ))}
      </section>

      {data.totals.activeAds === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          No ad delivered in this range. Try a wider window.
        </p>
      ) : (
        <>
          <AdTable data={data} />

          <LandingTable rows={data.landing} />

          <section className="flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Audience across the range</h3>
              <p className="text-[11px] text-muted">
                every ad combined, summed over the selected days
              </p>
            </div>
            <Breakdown title="Age" rows={sortAge(data.age)} />
            <Breakdown title="Gender" rows={sortGender(data.gender)} />
            <Breakdown title="Age × Gender" rows={sortAgeGender(data.ageGender)} grouped />
            <Breakdown
              title="Region"
              rows={data.region.slice(0, 20)}
              note={
                data.hasShopify
                  ? "revenue is Shopify orders tagged to these ads — last-click, so a floor"
                  : "spend only — Meta reports no revenue by region"
              }
              revenueIsShopify={data.hasShopify}
            />
          </section>
        </>
      )}
    </div>
  );
}

function sortAge(rows: BreakdownRow[]) {
  return [...rows].sort((a, b) => AGE_ORDER.indexOf(a.segment) - AGE_ORDER.indexOf(b.segment));
}
function sortGender(rows: BreakdownRow[]) {
  return [...rows].sort((a, b) => GENDER_ORDER.indexOf(a.segment) - GENDER_ORDER.indexOf(b.segment));
}
function sortAgeGender(rows: BreakdownRow[]) {
  return [...rows].sort((a, b) => {
    const g = GENDER_ORDER.indexOf(genderOf(a.segment)) - GENDER_ORDER.indexOf(genderOf(b.segment));
    return g !== 0 ? g : AGE_ORDER.indexOf(ageOf(a.segment)) - AGE_ORDER.indexOf(ageOf(b.segment));
  });
}

// ---------------------------------------------------------------------------
// Per-ad table
// ---------------------------------------------------------------------------
type SortKey = "spend" | "revenue" | "roas" | "purchases" | "clicks" | "ctr" | "title";

const AD_GRID = "grid-cols-[minmax(180px,2fr)_92px_100px_70px_84px_84px_72px]";

function AdTable({ data }: { data: ReportData }) {
  const fmt = useFormat();
  const [sort, setSort] = useState<SortKey>("spend");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const out = [...data.ads];
    out.sort((a, b) => {
      const v = sort === "title" ? a.title.localeCompare(b.title) : (a[sort] as number) - (b[sort] as number);
      return asc ? v : -v;
    });
    return out;
  }, [data.ads, sort, asc]);

  const head: { key: SortKey; label: string; right?: boolean }[] = [
    { key: "title", label: "Ad" },
    { key: "spend", label: "Spend", right: true },
    { key: "revenue", label: "Revenue", right: true },
    { key: "roas", label: "ROAS", right: true },
    { key: "purchases", label: "Purch.", right: true },
    { key: "clicks", label: "Clicks", right: true },
    { key: "ctr", label: "CTR", right: true },
  ];

  const toggle = (k: SortKey) => {
    if (k === sort) setAsc(!asc);
    else {
      setSort(k);
      setAsc(k === "title");
    }
  };

  return (
    <section>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Every ad in this range{" "}
          <span className="font-normal text-muted">· {rows.length}</span>
        </h3>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-surface">
        <div className="min-w-[860px]">
          <div
            className={`grid items-center gap-3 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted ${AD_GRID}`}
          >
            {head.map((h) => (
              <button
                key={h.key}
                onClick={() => toggle(h.key)}
                className={`flex items-center gap-1 hover:text-ink ${h.right ? "justify-end" : ""}`}
              >
                {h.label}
                {sort === h.key && <span className="text-brand">{asc ? "▲" : "▼"}</span>}
              </button>
            ))}
          </div>

          {rows.map((r) => (
            <Link
              key={r.adId}
              href={`/ad/${r.adId}`}
              className={`grid items-center gap-3 border-b border-line-2 px-4 py-2.5 text-sm last:border-0 hover:bg-surface-2 ${AD_GRID}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{r.title}</span>
                <span className="block truncate text-[11px] text-muted">
                  {r.type} · {r.angle} · {r.daysActive}d · {r.status}
                </span>
              </span>
              <span className="text-right font-mono text-ink">{fmt(r.spend)}</span>
              <span className="text-right font-mono text-ink-3">{fmt(r.revenue)}</span>
              <span
                className={`text-right font-mono ${
                  r.roas >= 1.3 ? "text-green" : r.roas >= 1 ? "text-amber" : "text-red"
                }`}
              >
                {r.spend > 0 ? formatRoas(r.roas) : "—"}
              </span>
              <span className="text-right font-mono text-ink-3">{formatInt(r.purchases)}</span>
              <span className="text-right font-mono text-ink-3">{formatInt(r.clicks)}</span>
              <span className="text-right font-mono text-ink-3">{r.ctr.toFixed(2)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Breakdown table
// ---------------------------------------------------------------------------
const BD_GRID = "grid-cols-[minmax(110px,1fr)_minmax(120px,200px)_90px_92px_64px_74px_64px]";

function Breakdown({
  title,
  rows,
  note,
  grouped,
  revenueIsShopify,
}: {
  title: string;
  rows: BreakdownRow[];
  note?: string;
  grouped?: boolean;
  revenueIsShopify?: boolean;
}) {
  const fmt = useFormat();
  if (rows.length === 0) return null;

  const scaleMax = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-ink-2">{title}</h4>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-surface">
        <div className="min-w-[640px]">
          <div
            className={`grid items-center gap-3 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted ${BD_GRID}`}
          >
            <span>{title}</span>
            <span>Spend share</span>
            <span className="text-right">Spend</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">ROAS</span>
            <span className="text-right">Clicks</span>
            <span className="text-right">CTR</span>
          </div>

          {rows.map((r, i) => {
            const gender = grouped ? genderOf(r.segment) : null;
            const newGroup = gender !== null && (i === 0 || genderOf(rows[i - 1].segment) !== gender);
            const label = grouped ? ageOf(r.segment) : r.segment;
            return (
              <div key={r.segment} className="contents">
                {newGroup && (
                  <div className="border-b border-line-2 bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                    {gender}
                  </div>
                )}
                <div
                  className={`grid items-center gap-3 border-b border-line-2 px-4 py-2.5 text-sm last:border-0 ${BD_GRID}`}
                >
                  <span className="truncate font-medium capitalize text-ink">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-2">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (r.spend / scaleMax) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
                      {r.share.toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-right font-mono text-ink">{fmt(r.spend)}</span>
                  <span className="text-right font-mono text-ink-3">
                    {r.revenue > 0 ? fmt(r.revenue) : "—"}
                  </span>
                  <span
                    className={`text-right font-mono ${
                      r.revenue === 0
                        ? "text-muted"
                        : r.roas >= 1.3
                          ? "text-green"
                          : r.roas >= 1
                            ? "text-amber"
                            : "text-red"
                    }`}
                    title={revenueIsShopify ? "Shopify-attributed revenue over Meta spend" : undefined}
                  >
                    {r.revenue > 0 && r.spend > 0 ? formatRoas(r.roas) : "—"}
                  </span>
                  <span className="text-right font-mono text-ink-3">{formatInt(r.clicks)}</span>
                  <span className="text-right font-mono text-ink-3">{r.ctr.toFixed(2)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing pages — where ads send people, how many never get the page, how fast
// ---------------------------------------------------------------------------
const LP_GRID =
  "grid-cols-[minmax(200px,1fr)_44px_96px_84px_84px_70px_84px_64px_64px]";

function LandingTable({ rows }: { rows: LandingRow[] }) {
  const fmt = useFormat();
  const withFunnel = rows.filter((r) => r.linkClicks > 0);
  const totalLost = withFunnel.reduce((s, r) => s + r.lost, 0);
  const totalLink = withFunnel.reduce((s, r) => s + r.linkClicks, 0);

  const pathOf = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`;
    } catch {
      return url;
    }
  };
  const landedTone = (p: number | null) =>
    p === null ? "text-muted" : p >= 85 ? "text-green" : p >= 70 ? "text-amber" : "text-red";
  const scoreTone = (s: number | null) =>
    s === null ? "text-muted" : s >= 90 ? "text-green" : s >= 50 ? "text-amber" : "text-red";
  const lcpTone = (ms: number | null) =>
    ms === null ? "text-muted" : ms <= 2500 ? "text-green" : ms <= 4000 ? "text-amber" : "text-red";

  return (
    <section>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Landing pages <span className="font-normal text-muted">· {rows.length}</span>
          </h3>
          <p className="text-[11px] text-muted">
            {withFunnel.length === 0
              ? "Link clicks and page loads fill in from the next Meta sync."
              : `${formatInt(totalLost)} of ${formatInt(totalLink)} link clicks never got the page (${(
                  (totalLost / totalLink) *
                  100
                ).toFixed(0)}%). 10–25% is normal on mobile; worst leak first.`}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          No landing pages known yet — they&apos;re read from Meta on the next sync.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-surface">
          <div className="min-w-[900px]">
            <div
              className={`grid items-center gap-3 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted ${LP_GRID}`}
            >
              <span>Page</span>
              <span className="text-right">Ads</span>
              <span className="text-right">Spend</span>
              <span className="text-right">Link clicks</span>
              <span className="text-right">Loaded</span>
              <span className="text-right">Landed</span>
              <span className="text-right">Never landed</span>
              <span className="text-right">Speed</span>
              <span className="text-right">Load</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.url}
                className={`grid items-center gap-3 border-b border-line-2 px-4 py-2.5 text-sm last:border-0 ${LP_GRID}`}
              >
                <span className="min-w-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium text-ink hover:text-brand hover:underline"
                    title={r.url}
                  >
                    {pathOf(r.url)}
                  </a>
                  <span className="block text-[11px] text-muted">
                    {r.purchases > 0 && r.landingPageViews > 0
                      ? `${((r.purchases / r.landingPageViews) * 100).toFixed(1)}% of landers bought · `
                      : ""}
                    <a
                      href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(r.url)}&form_factor=mobile`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      speed report ↗
                    </a>
                  </span>
                </span>
                <span className="text-right font-mono text-ink-3">{r.ads}</span>
                <span className="text-right font-mono text-ink">{fmt(r.spend)}</span>
                <span className="text-right font-mono text-ink-3">
                  {r.linkClicks > 0 ? formatInt(r.linkClicks) : "—"}
                </span>
                <span className="text-right font-mono text-ink-3">
                  {r.linkClicks > 0 ? formatInt(r.landingPageViews) : "—"}
                </span>
                <span className={`text-right font-mono ${landedTone(r.landedPct)}`}>
                  {r.landedPct === null ? "—" : `${r.landedPct.toFixed(0)}%`}
                </span>
                <span className={`text-right font-mono ${landedTone(r.landedPct)}`}>
                  {r.linkClicks > 0 ? formatInt(r.lost) : "—"}
                </span>
                <span
                  className={`text-right font-mono ${scoreTone(r.speed?.error ? null : (r.speed?.score ?? null))}`}
                  title={r.speed?.error ?? undefined}
                >
                  {r.speed && !r.speed.error && r.speed.score !== null ? r.speed.score : "—"}
                </span>
                <span className={`text-right font-mono ${lcpTone(r.speed?.error ? null : (r.speed?.lcpMs ?? null))}`}>
                  {r.speed && !r.speed.error && r.speed.lcpMs !== null ? `${(r.speed.lcpMs / 1000).toFixed(1)}s` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
