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

export function AdFrame({ data, perms }: { data: AdFrameData; perms: Permissions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fmt = useFormat();
  const fmtDate = useDate();
  const rec = recommendation(data);
  const d = lifetimeDerived(data.lifetime);

  const last7 = data.daily.slice(-7);
  const prior7 = data.daily.slice(-14, -7);
  const sumK = (rows: typeof last7, k: keyof (typeof last7)[number]) =>
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

  const dates = last7.map((r) => r.asOfDate);
  const roas7 = sumK(last7, "revenue") / Math.max(1, sumK(last7, "spend"));

  // 7-day mini-graphs with last-7-vs-prior-7 deltas. `good` = is an increase good?
  // `headline` = the 7-day total (or period value), `format` = per-day point labels.
  const graphs: { label: string; series: number[]; delta: number; good: boolean; headline: string; format: (v: number) => string }[] = [
    { label: "Spend", series: last7.map((r) => r.spend), delta: delta(sumK(last7, "spend"), sumK(prior7, "spend")), good: true, headline: fmt(sumK(last7, "spend")), format: fmt },
    { label: "Revenue", series: last7.map((r) => r.revenue), delta: delta(sumK(last7, "revenue"), sumK(prior7, "revenue")), good: true, headline: fmt(sumK(last7, "revenue")), format: fmt },
    { label: "Impressions", series: last7.map((r) => r.impressions), delta: delta(sumK(last7, "impressions"), sumK(prior7, "impressions")), good: true, headline: formatInt(sumK(last7, "impressions")), format: compact },
    { label: "Clicks", series: last7.map((r) => r.clicks), delta: delta(sumK(last7, "clicks"), sumK(prior7, "clicks")), good: true, headline: formatInt(sumK(last7, "clicks")), format: compact },
    { label: "Conversions", series: last7.map((r) => r.conversions), delta: delta(sumK(last7, "conversions"), sumK(prior7, "conversions")), good: true, headline: formatInt(sumK(last7, "conversions")), format: compact },
    { label: "ROAS", series: last7.map((r) => (r.spend > 0 ? r.revenue / r.spend : 0)), delta: delta(roas7, sumK(prior7, "revenue") / Math.max(1, sumK(prior7, "spend"))), good: true, headline: formatRoas(roas7), format: (v) => `${v.toFixed(1)}×` },
    { label: "Reach", series: last7.map((r) => r.reach), delta: delta(data.range.last7.reach, data.range.prior7.reach), good: true, headline: formatInt(data.range.last7.reach), format: compact },
    { label: "Frequency", series: last7.map((r) => r.reach > 0 ? r.impressions / r.reach : 0), delta: delta(data.range.last7.frequency, data.range.prior7.frequency), good: false, headline: data.range.last7.frequency.toFixed(2), format: (v) => v.toFixed(2) },
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
            <h3 className="mb-2 text-sm font-semibold text-ink">Last 7 days</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {graphs.map((g) => (
                <Sparkline key={g.label} dates={dates} {...g} />
              ))}
            </div>
          </section>
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
            <circle cx={c.x} cy={c.y} r="2.2" fill="var(--brand)" />
            <text x={c.x} y={c.y - 6} textAnchor={anchor(i)} fontSize="9" fill="var(--ink-2)" fontFamily="ui-monospace, monospace">
              {format(series[i])}
            </text>
            <text x={c.x} y={h - 3} textAnchor={anchor(i)} fontSize="8.5" fill="var(--muted)">
              {shortDate(dates[i])}
            </text>
          </g>
        ))}
      </svg>
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
