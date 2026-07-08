"use client";

import { useMemo, useState } from "react";
import type { DashCreative } from "@/lib/data/dashboard";
import { creativeScore } from "@/lib/score";
import { formatInt, formatRoas } from "@/lib/format";
import { ScorePill } from "@/components/ui/primitives";
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
  subtype: "bg-amber",
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

/** Full-counted persona grouping — a creative appears under each of its personas. */
function groupByPersona(items: DashCreative[]): Map<string, DashCreative[]> {
  const m = new Map<string, DashCreative[]>();
  for (const c of items) {
    for (const p of c.personas) {
      if (!p) continue;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(c);
    }
  }
  return m;
}

/**
 * Four-level tree (design 02): Angle → Persona → Type → Sub-type, or with the
 * first two levels swapped when starting from Persona. Personas full-counted.
 */
function buildTree(creatives: DashCreative[], root: "angle" | "persona"): TreeNode[] {
  const bySpend = (a: TreeNode, b: TreeNode) => b.spend - a.spend;

  const subtypeNodes = (items: DashCreative[]) =>
    [...groupBy(items, (c) => c.subtype).entries()]
      .map(([st, its]) => nodeFrom(st, "subtype", its, []))
      .sort(bySpend);

  const typeNodes = (items: DashCreative[]) =>
    [...groupBy(items, (c) => c.type).entries()]
      .map(([t, its]) => nodeFrom(t, "type", its, subtypeNodes(its)))
      .sort(bySpend);

  const personaNodes = (items: DashCreative[]) =>
    [...groupByPersona(items).entries()]
      .map(([p, its]) => nodeFrom(p, "persona", its, typeNodes(its)))
      .sort(bySpend);

  const angleNodes = (items: DashCreative[]) =>
    [...groupBy(items, (c) => c.angle).entries()]
      .map(([a, its]) => nodeFrom(a, "angle", its, typeNodes(its)))
      .sort(bySpend);

  if (root === "angle") {
    return [...groupBy(creatives, (c) => c.angle).entries()]
      .filter(([label]) => label)
      .map(([label, items]) => nodeFrom(label, "angle", items, personaNodes(items)))
      .sort(bySpend);
  }
  return [...groupByPersona(creatives).entries()]
    .map(([label, items]) => nodeFrom(label, "persona", items, angleNodes(items)))
    .sort(bySpend);
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
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">Performance tree</h3>
          <p className="mt-0.5 text-xs text-muted">
            Angle → Persona → Type → Sub-type · expand any row to drill deeper
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Start from</span>
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
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        {/* Scroll the table sideways on narrow screens rather than breaking the page. */}
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={cn(GRID, "border-b border-line-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted")}>
              <span>Angle / Persona / Type / Sub-type</span>
              <span>Spend share</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">ROAS</span>
              <span className="text-right">Score</span>
              <span className="text-right">Creatives</span>
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
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        A creative can carry more than one persona, so persona rows count it in full under each —
        persona spend will overlap and won&apos;t sum to the total. Use it to see what&apos;s
        working, not to reconcile budgets.
      </p>
    </section>
  );
}

const GRID = "grid grid-cols-[minmax(200px,1fr)_200px_110px_80px_70px_80px] items-center gap-3";

function Row({ node, depth, maxSpend }: { node: TreeNode; depth: number; maxSpend: number }) {
  const [open, setOpen] = useState(false);
  const roas = node.spend > 0 ? node.revenue / node.spend : 0;
  const score = creativeScore(node.spend, roas);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={cn(GRID, "border-b border-line-2 px-4 py-3 text-sm hover:bg-surface-2")}
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
          <span className={cn("h-3.5 w-1 shrink-0 rounded", DIM_TAB[node.dim])} />
          <span className="truncate font-medium text-ink">{node.label}</span>
        </div>
        <div className="pr-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-2">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.min(100, (node.spend / maxSpend) * 100)}%` }}
            />
          </div>
          <div className="mt-1 font-mono text-xs text-ink-3">₹{formatInt(node.spend)}</div>
        </div>
        <span className="text-right font-mono text-ink">₹{formatInt(node.revenue)}</span>
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
