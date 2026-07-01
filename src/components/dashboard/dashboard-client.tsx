"use client";

import type { DashboardData } from "@/lib/data/dashboard";
import { formatInt, formatRoas } from "@/lib/format";
import { useFormat } from "@/components/providers/settings-provider";
import { PerfTree } from "./perf-tree";

export function DashboardClient({ data }: { data: DashboardData }) {
  const { kpis, central, creatives } = data;
  const fmt = useFormat();

  const tiles = [
    { label: "Ad Spend", value: fmt(kpis.spend) },
    { label: "Revenue", value: fmt(kpis.revenue) },
    { label: "Blended ROAS", value: kpis.spend > 0 ? formatRoas(kpis.roas) : "—" },
    { label: "Conversions", value: formatInt(kpis.conversions) },
    { label: "Live Ads", value: formatInt(kpis.liveAds) },
  ];

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted">{t.label}</div>
            <div className="mt-1 font-mono text-xl font-bold text-ink">{t.value}</div>
          </div>
        ))}
      </div>

      {/* Central Group banner */}
      {central ? (
        <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand to-brand-deep p-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            Central Group
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-2xl font-bold">{central.persona}</span>
            <span className="font-mono text-sm text-white/90">
              {fmt(central.spend)} · {formatRoas(central.roas)} ROAS
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Your strongest persona at scale — winning on <b>{central.format}</b> creative via the{" "}
            <b>{central.angle}</b> angle. This is the central group to double down on.
          </p>
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
