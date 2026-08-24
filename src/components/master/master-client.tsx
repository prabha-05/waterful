"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LabelRow, MasterData, TagGroupRow, TypeRow } from "@/lib/data/master";
import {
  addMapping,
  createSubtype,
  createTag,
  createTagGroup,
  createTaxonomy,
  deleteTag,
  deleteTagGroup,
  deleteTaxonomy,
  removeMapping,
  renameTag,
  renameTagGroup,
  renameTaxonomy,
  setArchivedTag,
  setArchivedTaxonomy,
  type TaxKind,
} from "@/app/actions/master";
import { Button, Chip, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Tab = "personas" | "angles" | "mapping" | "types" | "dimensions" | "tags";
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

export function MasterClient({ data }: { data: MasterData }) {
  const [tab, setTab] = useState<Tab>("personas");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run: Run = (fn) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });

  const tabs: { key: Tab; label: string }[] = [
    { key: "personas", label: "Personas" },
    { key: "angles", label: "Angles" },
    { key: "mapping", label: "Angle ↔ Persona" },
    { key: "types", label: "Types & Sub-types" },
    { key: "dimensions", label: "Dimensions" },
    { key: "tags", label: "Tags" },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-1 self-start rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-sm font-medium">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn("rounded-md px-3 py-1.5 transition", tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-3")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-[var(--radius-control)] bg-red-bg px-3 py-2 text-sm text-red">{error}</div>}

      {tab === "personas" && <LabelList kind="persona" title="Persona" items={data.personas} run={run} pending={pending} />}
      {tab === "angles" && <LabelList kind="angle" title="Angle" items={data.angles} run={run} pending={pending} />}
      {tab === "mapping" && <Mapping data={data} run={run} pending={pending} />}
      {tab === "types" && <Types types={data.types} run={run} pending={pending} />}
      {tab === "tags" && <TagGroups groups={data.tagGroups} run={run} pending={pending} />}
      {tab === "dimensions" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <LabelList kind="awareness" title="Awareness stage" items={data.awareness} run={run} pending={pending} />
          <LabelList kind="hook" title="Hook type" items={data.hooks} run={run} pending={pending} />
        </div>
      )}
    </div>
  );
}

function LabelList({
  kind,
  title,
  items,
  run,
  pending,
}: {
  kind: Exclude<TaxKind, "subtype">;
  title: string;
  items: LabelRow[];
  run: Run;
  pending: boolean;
}) {
  const [newLabel, setNewLabel] = useState("");
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={`New ${title.toLowerCase()}…`} />
        <Button
          disabled={pending || !newLabel.trim()}
          onClick={() => run(async () => { const r = await createTaxonomy(kind, newLabel); if (r.ok) setNewLabel(""); return r; })}
        >
          Add
        </Button>
      </div>
      <div className="divide-y divide-line-2">
        {items.map((it) => (
          <LabelRowView key={it.id} kind={kind} item={it} run={run} pending={pending} />
        ))}
      </div>
    </div>
  );
}

function LabelRowView({
  kind,
  item,
  run,
  pending,
}: {
  kind: TaxKind;
  item: LabelRow;
  run: Run;
  pending: boolean;
}) {
  const [label, setLabel] = useState(item.label);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2", item.archived && "opacity-60")}>
      <input
        value={label}
        disabled={pending}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== item.label && run(() => renameTaxonomy(kind, item.id, label))}
        className="min-w-[140px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-line focus:border-brand focus:outline-none"
      />
      <span className="text-[11px] text-muted">in use on {item.usage}</span>
      {item.archived && <Chip className="bg-line-2 text-muted">Archived</Chip>}
      <button
        disabled={pending}
        onClick={() => run(() => setArchivedTaxonomy(kind, item.id, !item.archived))}
        className="text-xs font-medium text-ink-3 hover:underline"
      >
        {item.archived ? "Restore" : "Archive"}
      </button>
      {item.usage === 0 && (
        <button disabled={pending} onClick={() => run(() => deleteTaxonomy(kind, item.id))} className="text-xs font-medium text-red hover:underline">
          Delete
        </button>
      )}
    </div>
  );
}

function Types({ types, run, pending }: { types: TypeRow[]; run: Run; pending: boolean }) {
  const [newType, setNewType] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
        <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New type (auto-adds 'Other / Untyped')…" />
        <Button disabled={pending || !newType.trim()} onClick={() => run(async () => { const r = await createTaxonomy("type", newType); if (r.ok) setNewType(""); return r; })}>
          Add Type
        </Button>
      </div>
      {types.map((t) => (
        <div key={t.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{t.label}</span>
            <span className="text-[11px] text-muted">in use on {t.usage}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {t.subtypes.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-line bg-surface-2 px-2.5 py-1 text-xs">
                <span className={cn(s.archived && "line-through opacity-60")}>{s.label}</span>
                <span className="text-muted">({s.usage})</span>
                {s.usage === 0 && (
                  <button disabled={pending} onClick={() => run(() => deleteTaxonomy("subtype", s.id))} className="text-red">×</button>
                )}
              </span>
            ))}
            <AddSubtype typeId={t.id} run={run} pending={pending} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AddSubtype({ typeId, run, pending }: { typeId: string; run: Run; pending: boolean }) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand">+ Add sub-type</button>;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        className="h-7 w-28 rounded-md border border-line px-2 text-xs focus:border-brand focus:outline-none"
      />
      <button
        disabled={pending || !val.trim()}
        onClick={() => run(async () => { const r = await createSubtype(typeId, val); if (r.ok) { setVal(""); setOpen(false); } return r; })}
        className="text-xs font-medium text-brand"
      >
        Save
      </button>
    </span>
  );
}

function Mapping({ data, run, pending }: { data: MasterData; run: Run; pending: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {data.mapping.map((m) => {
        const mappedIds = new Set(m.personas.map((p) => p.personaId));
        const available = data.personaOptions.filter((p) => !mappedIds.has(p.id));
        return (
          <div key={m.angleId} className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
            <div className="mb-2 text-sm font-semibold text-ink">{m.angleLabel}</div>
            <div className="flex flex-wrap items-center gap-2">
              {m.personas.map((p) => (
                <span key={p.personaId} className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-brand-chip px-2.5 py-1 text-xs text-brand-deep">
                  {p.personaLabel}
                  <span className="text-muted">({p.usage})</span>
                  {p.usage === 0 ? (
                    <button disabled={pending} onClick={() => run(() => removeMapping(m.angleId, p.personaId))} className="text-red">×</button>
                  ) : (
                    <span title="Locked — in use">🔒</span>
                  )}
                </span>
              ))}
              {available.length > 0 && (
                <AddPersonaToAngle angleId={m.angleId} options={available} run={run} pending={pending} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddPersonaToAngle({
  angleId,
  options,
  run,
  pending,
}: {
  angleId: string;
  options: { id: string; label: string }[];
  run: Run;
  pending: boolean;
}) {
  const [val, setVal] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <Select value={val} onChange={(e) => setVal(e.target.value)} className="h-7 w-40 text-xs">
        <option value="">+ Add persona</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </Select>
      {val && (
        <button disabled={pending} onClick={() => run(async () => { const r = await addMapping(angleId, val); if (r.ok) setVal(""); return r; })} className="text-xs font-medium text-brand">
          Add
        </button>
      )}
    </span>
  );
}

/**
 * The 2026-08-24 dimensions: one card per group, heading + tag pills, mirroring
 * how Types & Sub-types reads. Groups live in the DB, so a new dimension is
 * added here rather than in a migration.
 */
function TagGroups({
  groups,
  run,
  pending,
}: {
  groups: TagGroupRow[];
  run: Run;
  pending: boolean;
}) {
  const [newGroup, setNewGroup] = useState("");
  const [multi, setMulti] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
        <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New dimension (e.g. Offer Type)…" />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          Allow several per creative
        </label>
        <Button
          disabled={pending || !newGroup.trim()}
          onClick={() => run(async () => {
            const r = await createTagGroup(newGroup, multi);
            if (r.ok) { setNewGroup(""); setMulti(false); }
            return r;
          })}
        >
          Add Dimension
        </Button>
      </div>

      {groups.length === 0 && (
        <p className="px-1 text-sm text-muted">No dimensions yet — add one above.</p>
      )}

      {groups.map((g) => {
        const inUse = g.tags.reduce((n, t) => n + t.usage, 0);
        return (
          <div key={g.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <GroupHeading group={g} run={run} pending={pending} />
              <Chip className="bg-surface-2 text-ink-3">{g.multi ? "Multi-select" : "Single-select"}</Chip>
              <span className="text-[11px] text-muted">{g.tags.length} tags · in use on {inUse}</span>
              {inUse === 0 && (
                <button
                  disabled={pending}
                  onClick={() => run(() => deleteTagGroup(g.id))}
                  className="text-xs font-medium text-red hover:underline"
                >
                  Delete dimension
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {g.tags.map((t) => (
                <TagPill key={t.id} tag={t} run={run} pending={pending} />
              ))}
              <AddTag groupId={g.id} run={run} pending={pending} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupHeading({ group, run, pending }: { group: TagGroupRow; run: Run; pending: boolean }) {
  const [label, setLabel] = useState(group.label);
  return (
    <input
      value={label}
      disabled={pending}
      onChange={(e) => setLabel(e.target.value)}
      onBlur={() => label.trim() && label !== group.label && run(() => renameTagGroup(group.id, label))}
      className="w-44 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-ink hover:border-line focus:border-brand focus:outline-none"
    />
  );
}

function TagPill({ tag, run, pending }: { tag: TagGroupRow["tags"][number]; run: Run; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);

  if (editing) {
    return (
      <input
        value={label}
        autoFocus
        disabled={pending}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (label.trim() && label !== tag.label) run(() => renameTag(tag.id, label));
          else setLabel(tag.label);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-7 w-40 rounded-md border border-brand px-2 text-xs focus:outline-none"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-line bg-surface-2 px-2.5 py-1 text-xs">
      <button
        onClick={() => setEditing(true)}
        className={cn("hover:underline", tag.archived && "line-through opacity-60")}
        title="Rename"
      >
        {tag.label}
      </button>
      <span className="text-muted">({tag.usage})</span>
      <button
        disabled={pending}
        onClick={() => run(() => setArchivedTag(tag.id, !tag.archived))}
        className="text-ink-3 hover:underline"
        title={tag.archived ? "Restore" : "Archive"}
      >
        {tag.archived ? "↺" : "⌀"}
      </button>
      {tag.usage === 0 && (
        <button disabled={pending} onClick={() => run(() => deleteTag(tag.id))} className="text-red" title="Delete">×</button>
      )}
    </span>
  );
}

function AddTag({ groupId, run, pending }: { groupId: string; run: Run; pending: boolean }) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand">+ Add tag</button>;
  const save = () => run(async () => {
    const r = await createTag(groupId, val);
    if (r.ok) { setVal(""); setOpen(false); }
    return r;
  });
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) save(); if (e.key === "Escape") setOpen(false); }}
        className="h-7 w-36 rounded-md border border-line px-2 text-xs focus:border-brand focus:outline-none"
      />
      <button disabled={pending || !val.trim()} onClick={save} className="text-xs font-medium text-brand">Save</button>
    </span>
  );
}
