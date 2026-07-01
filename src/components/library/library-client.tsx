"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreativeCard } from "@/lib/data/creatives";
import type { Taxonomy } from "@/lib/data/taxonomy";
import type { Permissions } from "@/lib/auth/permissions";
import { Select } from "@/components/ui/primitives";
import { CreativeCardView } from "./creative-card";
import { CreativeDetail } from "./creative-detail";
import { ScoreExplainer } from "./score-explainer";

type SortKey = "recent" | "score" | "spend" | "roas";
const STATUSES = ["draft", "live", "paused", "archived"] as const;

export function LibraryClient({
  creatives,
  taxonomy,
  perms,
}: {
  creatives: CreativeCard[];
  taxonomy: Taxonomy;
  perms: Permissions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [persona, setPersona] = useState("");
  const [angle, setAngle] = useState("");
  const [type, setType] = useState("");
  const [subtype, setSubtype] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const subtypeOptions = useMemo(
    () => taxonomy.types.find((t) => t.label === type)?.subtypes ?? [],
    [taxonomy.types, type],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = creatives.filter((c) => {
      if (q) {
        const hay = `${c.title} ${c.angle} ${c.personas.join(" ")} ${c.type} ${c.subtype}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (persona && !c.personas.includes(persona)) return false;
      if (angle && c.angle !== angle) return false;
      if (type && c.type !== type) return false;
      if (subtype && c.subtype !== subtype) return false;
      if (status && c.status !== status) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "score": return b.score - a.score;
        case "spend": return b.spend - a.spend;
        case "roas": return b.roas - a.roas;
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return list;
  }, [creatives, search, persona, angle, type, subtype, status, sort]);

  const hasFilters = !!(search || persona || angle || type || subtype || status);
  const clearFilters = () => {
    setSearch(""); setPersona(""); setAngle(""); setType(""); setSubtype(""); setStatus("");
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Row 1 — search, sort, count, score-explainer */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, angle, persona, type…"
          className="h-9 w-72 rounded-[var(--radius-control)] border border-[#e0e5ea] bg-surface px-3 text-sm outline-none focus:border-brand"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 w-36">
          <option value="recent">Recent</option>
          <option value="score">Score</option>
          <option value="spend">Spend</option>
          <option value="roas">ROAS</option>
        </Select>
        <span className="text-sm text-muted">
          {filtered.length} creative{filtered.length === 1 ? "" : "s"}
        </span>
        <ScoreExplainer />
      </div>

      {/* Row 2 — filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={persona} onChange={(e) => setPersona(e.target.value)} className="h-9 w-44">
          <option value="">All personas</option>
          {taxonomy.personas.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
        </Select>
        <Select value={angle} onChange={(e) => setAngle(e.target.value)} className="h-9 w-44">
          <option value="">All angles</option>
          {taxonomy.angles.map((a) => <option key={a.id} value={a.label}>{a.label}</option>)}
        </Select>
        <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-2 py-1">
          <Select
            value={type}
            onChange={(e) => { setType(e.target.value); setSubtype(""); }}
            className="h-8 w-32 border-0 bg-transparent"
          >
            <option value="">Any type</option>
            {taxonomy.types.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
          </Select>
          <Select
            value={subtype}
            disabled={!type}
            onChange={(e) => setSubtype(e.target.value)}
            className="h-8 w-36 border-0 bg-transparent"
          >
            <option value="">Any sub-type</option>
            {subtypeOptions.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
          </Select>
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-36">
          <option value="">All status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </Select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Grid / empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-2">No creatives match</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {filtered.map((c) => (
            <CreativeCardView key={c.id} card={c} onClick={() => setSelectedId(c.id)} />
          ))}
        </div>
      )}

      <CreativeDetail
        creativeId={selectedId}
        taxonomy={taxonomy}
        perms={perms}
        onClose={() => setSelectedId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
