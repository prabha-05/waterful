"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MetaSyncData } from "@/lib/data/meta-sync";
import { triggerRebuild, triggerSync } from "@/app/actions/meta-sync";
import { Button, Chip } from "@/components/ui/primitives";
import { useDate } from "@/components/providers/settings-provider";

const STATUS_CLASS: Record<string, string> = {
  success: "text-green bg-green-bg",
  running: "text-amber bg-amber-bg",
  failed: "text-red bg-red-bg",
};

export function MetaSyncClient({ data, canRebuild }: { data: MetaSyncData; canRebuild: boolean }) {
  const router = useRouter();
  const fmtDate = useDate();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; ads?: number }>) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? `Synced ${res.ads ?? 0} ad(s).` : (res.error ?? "Sync failed."));
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-5 p-6">
      {!data.hasToken && (
        <div className="rounded-[var(--radius-control)] bg-amber-bg px-3 py-2 text-sm text-amber">
          No META_ACCESS_TOKEN set — syncs will use the mock provider.
        </div>
      )}

      {/* Automatic sync status */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Automatic sync</h3>
          <Chip className="bg-green-bg text-green">Active</Chip>
        </div>
        <p className="mb-4 text-sm text-ink-3">Every day at 6:00 AM · last 28 days · every linked ad.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Ads tracked" value={String(data.adsTracked)} />
          <Tile label="Last sync" value={data.lastSync ? `${fmtDate(data.lastSync.at)} · ${data.lastSync.kind}` : "—"} />
          <Tile label="Next run" value="Tomorrow 6:00 AM" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Run a sync now</div>
          <div className="text-xs text-muted">Re-pull the last 28 days for all linked ads.</div>
        </div>
        <Button disabled={pending} onClick={() => run(triggerSync)}>
          {pending ? "Syncing…" : "Run sync now"}
        </Button>
      </div>

      {/* Danger zone — full rebuild (master only; server action re-checks) */}
      {canRebuild && (
      <div className="rounded-[var(--radius-card)] border border-red/30 bg-red-bg/30 p-5">
        <div className="text-sm font-semibold text-red">Full rebuild (danger zone)</div>
        <div className="mb-3 text-xs text-ink-3">
          Re-pulls every ad from its start date and rebuilds the metrics DB. Use only after a data discrepancy.
        </div>
        {!confirmRebuild ? (
          <Button variant="danger" onClick={() => setConfirmRebuild(true)}>Full rebuild…</Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink">Are you sure?</span>
            <Button variant="danger" disabled={pending} onClick={() => run(async () => { const r = await triggerRebuild(); setConfirmRebuild(false); return r; })}>
              Yes, rebuild everything
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRebuild(false)}>Cancel</Button>
          </div>
        )}
      </div>
      )}

      {msg && <div className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      {/* History */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Sync history</h3>
        {data.runs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No sync runs yet.</p>
        ) : (
          <div className="divide-y divide-line-2">
            {data.runs.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 px-4 py-2 text-sm">
                <span className="capitalize text-ink-2">{r.kind} · {r.window === "28d" ? "Last 28 days" : "Full history"}</span>
                <span className="text-muted">{fmtDate(r.startedAt)}</span>
                <span className="text-muted">{r.adsCount} ads{r.triggeredBy ? ` · ${r.triggeredBy}` : ""}</span>
                <Chip className={STATUS_CLASS[r.status] ?? "bg-surface-2 text-ink-3"}>{r.status}</Chip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
