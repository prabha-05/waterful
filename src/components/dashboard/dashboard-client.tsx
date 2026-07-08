"use client";

import type { DashboardData } from "@/lib/data/dashboard";
import { formatInt, formatRoas } from "@/lib/format";
import { useFormat } from "@/components/providers/settings-provider";
import { PerfTree } from "./perf-tree";

export function DashboardClient({ data }: { data: DashboardData }) {
  const { kpis, central, creatives } = data;
  const fmt = useFormat();

  const cpa = kpis.conversions > 0 ? kpis.spend / kpis.conversions : null;
  const tiles: { label: string; value: string; sub: string; tone?: string }[] = [
    { label: "Ad Spend", value: fmt(kpis.spend), sub: "across all linked ads" },
    { label: "Revenue", value: fmt(kpis.revenue), sub: "attributed" },
    { label: "Blended ROAS", value: kpis.spend > 0 ? formatRoas(kpis.roas) : "—", sub: "spend-weighted", tone: kpis.spend > 0 ? "text-green" : undefined },
    { label: "Conversions", value: formatInt(kpis.conversions), sub: cpa !== null ? `avg CPA ${fmt(cpa)}` : "no conversions yet" },
    { label: "Live Ads", value: formatInt(kpis.liveAds), sub: `${formatInt(kpis.linkedCreatives)} creatives` },
  ];

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted">{t.label}</div>
            <div className={`mt-1 font-mono text-xl font-bold ${t.tone ?? "text-ink"}`}>{t.value}</div>
            <div className="mt-1 text-[11px] text-muted">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Central Group banner */}
      {central ? (
        <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand to-brand-deep p-5 text-white">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="min-w-0 flex-1 basis-64">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Your Central Group
              </div>
              <div className="mt-1 text-2xl font-bold">{central.persona}</div>
              <p className="mt-2 max-w-xl text-sm text-white/85">
                Highest spend-weighted ROAS at meaningful scale. The <b>&ldquo;{central.angle}&rdquo;</b>{" "}
                angle in <b>{central.format}</b> format drives most of it — your strongest lever to scale.
              </p>
            </div>
            <div className="flex shrink-0 gap-8">
              {[
                { label: "Spend", value: fmt(central.spend) },
                { label: "ROAS", value: formatRoas(central.roas) },
                { label: "Win Format", value: central.format },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{s.label}</div>
                  <div className="mt-0.5 font-mono text-xl font-bold">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-5 text-sm text-muted">
          Central Group appears once linked ads have enough spend to rank personas.
        </div>
      )}

      {/* Performance tree */}
      <PerfTree creatives={creatives} />
    </div>
  );
}
