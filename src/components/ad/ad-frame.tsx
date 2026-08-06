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

/**
 * Label each window with the days of data behind it, so "Lifetime" reads
 * "Lifetime · 13 days" and a short-lived ad shows "Last 15 days · only 5 with
 * data" instead of silently plotting five points under a 15-day heading.
 */
function winLabels(totalDays: number): { key: WinKey; label: string; short: string }[] {
  return WIN_KEYS.map((key) => {
    if (key === "all") {
      return {
        key,
        label: `Lifetime · ${totalDays} day${totalDays === 1 ? "" : "s"}`,
        short: `Lifetime (${totalDays}d)`,
      };
    }
    const have = Math.min(key, totalDays);
    return {
      key,
      label: have < key ? `Last ${key} days · only ${have} with data` : `Last ${key} days`,
      short: have < key ? `Last ${key} days (${have}d)` : `Last ${key} days`,
    };
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
  const windows = winLabels(data.daily.length);
  const winLabel = windows.find((w) => w.key === win)!.label;
  const n = win === "all" ? data.daily.length : Math.min(win, data.daily.length);
  const cur = data.daily.slice(-n);
  const prior = win === "all" ? [] : data.daily.slice(-2 * n, -n);
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
              <h3 className="text-sm font-semibold text-ink">{winLabel}</h3>
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
