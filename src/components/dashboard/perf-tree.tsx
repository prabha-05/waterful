"use client";

import { useMemo, useState } from "react";
import type { DashCreative } from "@/lib/data/dashboard";
import { creativeScore } from "@/lib/score";
import { formatRoas } from "@/lib/format";
import { ScorePill } from "@/components/ui/primitives";
import { useFormat } from "@/components/providers/settings-provider";
import { cn } from "@/lib/utils";

type Dim = "angle" | "persona" | "type" | "subtype";
type TreeNode = {
  key: string;
  label: string;
  dim: Dim;
  spend: number;
  revenue: number;
  count: number;
  children: TreeNode[];
};

const DIM_TAB: Record<Dim, string> = {
  angle: "bg-brand",
  persona: "bg-[#7c5cd0]",
  type: "bg-green",
  subtype: "bg-muted-2",
};

function nodeFrom(label: string, dim: Dim, items: DashCreative[], children: TreeNode[]): TreeNode {
  return {
    key: `${dim}:${label}`,
    label,
    dim,
    spend: items.reduce((s, c) => s + c.spend, 0),
    revenue: items.reduce((s, c) => s + c.revenue, 0),
    count: new Set(items.map((c) => c.id)).size,
    children,
  };
}

function groupBy(items: DashCreative[], key: (c: DashCreative) => string): Map<string, DashCreative[]> {
  const m = new Map<string, DashCreative[]>();
  for (const c of items) {
    const k = key(c);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return m;
}

/** Angle/Persona → Type → Sub-type. Personas full-counted at level 1 (overlap). */
function buildTree(creatives: DashCreative[], root: "angle" | "persona"): TreeNode[] {
  const l1 = new Map<string, DashCreative[]>();
  for (const c of creatives) {
    const keys = root === "persona" ? c.personas : [c.angle];
    for (const k of keys) {
      if (!k) continue;
      if (!l1.has(k)) l1.set(k, []);
      l1.get(k)!.push(c);
    }
  }

  const subtypeNodes = (items: DashCreative[]) =>
    [...groupBy(items, (c) => c.subtype).entries()]
      .map(([st, its]) => nodeFrom(st, "subtype", its, []))
      .sort((a, b) => b.spend - a.spend);

  const typeNodes = (items: DashCreative[]) =>
    [...groupBy(items, (c) => c.type).entries()]
      .map(([t, its]) => nodeFrom(t, "type", its, subtypeNodes(its)))
      .sort((a, b) => b.spend - a.spend);

  return [...l1.entries()]
    .map(([label, items]) => nodeFrom(label, root, items, typeNodes(items)))
    .sort((a, b) => b.spend - a.spend);
}

function roasColor(roas: number): string {
  if (roas >= 2) return "text-green";
  if (roas >= 1) return "text-amber";
  return "text-red";
}

export function PerfTree({ creatives }: { creatives: DashCreative[] }) {
  const [root, setRoot] = useState<"angle" | "persona">("angle");
  const tree = useMemo(() => buildTree(creatives, root), [creatives, root]);
  const maxSpend = Math.max(...tree.map((n) => n.spend), 1);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Performance tree</h3>
        <div className="flex items-center gap-1 rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-xs font-medium">
          {(["angle", "persona"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoot(r)}
              className={cn(
                "rounded-md px-3 py-1 capitalize transition",
                root === r ? "bg-surface text-ink shadow-sm" : "text-ink-3",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll the table sideways on narrow screens rather than breaking the page. */}
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1fr_repeat(4,90px)] items-center gap-2 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span>{root === "angle" ? "Angle" : "Persona"} → Type → Sub-type</span>
            <span className="text-right">Spend</span>
            <span className="text-right">ROAS</span>
            <span className="text-right">Score</span>
            <span className="text-right"># creatives</span>
          </div>

          <div>
            {tree.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No data yet — link some ads.</p>
            ) : (
              tree.map((n) => <Row key={n.key} node={n} depth={0} maxSpend={maxSpend} />)
            )}
          </div>
        </div>
      </div>

      {root === "persona" && (
        <p className="border-t border-line-2 px-4 py-2 text-[11px] text-muted">
          Personas are full-counted — a creative with several personas appears under each, so
          persona totals won&apos;t reconcile to the overall spend. Angle totals do.
        </p>
      )}
    </div>
  );
}

function Row({ node, depth, maxSpend }: { node: TreeNode; depth: number; maxSpend: number }) {
  const [open, setOpen] = useState(false);
  const fmt = useFormat();
  const roas = node.spend > 0 ? node.revenue / node.spend : 0;
  const score = creativeScore(node.spend, roas);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className="grid grid-cols-[1fr_repeat(4,90px)] items-center gap-2 border-b border-line-2 px-4 py-2 text-sm hover:bg-surface-2"
        style={{ paddingLeft: 16 + depth * 18 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button onClick={() => setOpen((v) => !v)} className="text-muted">
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className={cn("h-3 w-1 shrink-0 rounded", DIM_TAB[node.dim])} />
          <span className="truncate text-ink">{node.label}</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-ink">{fmt(node.spend)}</div>
          <div className="ml-auto mt-0.5 h-1 w-full max-w-[80px] overflow-hidden rounded bg-line-2">
            <div className="h-full bg-brand/60" style={{ width: `${Math.min(100, (node.spend / maxSpend) * 100)}%` }} />
          </div>
        </div>
        <span className={cn("text-right font-mono", roasColor(roas))}>
          {node.spend > 0 ? formatRoas(roas) : "—"}
        </span>
        <span className="flex justify-end"><ScorePill score={node.spend > 0 ? score : null} /></span>
        <span className="text-right font-mono text-ink-3">{node.count}</span>
      </div>
      {open && node.children.map((c) => <Row key={c.key} node={c} depth={depth + 1} maxSpend={maxSpend} />)}
    </>
  );
}
