"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGE, STAGE_TILES, type ScriptStage } from "@/lib/script-stage";
import type { ScriptLibrary } from "@/lib/data/scripts";
import type { Taxonomy } from "@/lib/data/taxonomy";
import type { Permissions } from "@/lib/auth/permissions";
import { createScript } from "@/app/actions/scripts";
import { Button, Chip, Select } from "@/components/ui/primitives";
import { useDate } from "@/components/providers/settings-provider";
import { ScriptDrawer } from "./script-drawer";

const GRID = "grid-cols-[minmax(220px,2fr)_150px_150px_110px]";

export function ScriptsClient({
  data,
  taxonomy,
  perms,
}: {
  data: ScriptLibrary;
  taxonomy: Taxonomy;
  perms: Permissions;
}) {
  const router = useRouter();
  const fmtDate = useDate();
  const [stage, setStage] = useState<ScriptStage | "all">("all");
  const [q, setQ] = useState("");
  const [angle, setAngle] = useState("");
  const [writer, setWriter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [createErr, setCreateErr] = useState<string | null>(null);

  /**
   * Straight into the editor. Asking for a title and an angle in a modal, then
   * showing a second form with the same fields plus everything else, was two
   * forms for one job — the editor is where all of it is decided anyway.
   */
  const newScript = () => {
    setCreateErr(null);
    startCreate(async () => {
      const res = await createScript({ title: "Untitled script" });
      if (!res.ok) return setCreateErr(res.error ?? "Couldn't create the script.");
      setOpenId(res.id!);
    });
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.scripts.filter((s) => {
      if (stage !== "all" && s.stage !== stage) return false;
      if (angle && s.angle !== angle) return false;
      if (writer && s.writer !== writer) return false;
      if (!needle) return true;
      // Search covers what someone actually remembers: the title, the opening
      // line, or who wrote it.
      return (
        s.title.toLowerCase().includes(needle) ||
        s.hookLine.toLowerCase().includes(needle) ||
        s.writer.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle)
      );
    });
  }, [data.scripts, stage, q, angle, writer]);

  const filtered = stage !== "all" || angle || writer || q.trim();

  // Approving is gated on `master`, so only an approver is asked to approve.
  const waiting = data.counts.review;
  const showApprovalPrompt = perms.master && waiting > 0;

  return (
    <div className="flex flex-col gap-4 p-6">
      {showApprovalPrompt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-amber bg-amber-bg px-4 py-3">
          <span className="text-sm font-medium text-amber">
            {waiting === 1
              ? "1 script is waiting for your approval."
              : `${waiting} scripts are waiting for your approval.`}
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              setStage("review");
              // Jump straight in when there is only one — no hunting for it.
              const only = data.scripts.filter((x) => x.stage === "review");
              if (only.length === 1) setOpenId(only[0].id);
            }}
          >
            {waiting === 1 ? "Review it" : "Show them"}
          </Button>
        </div>
      )}

      {/* ---- stage pipeline as filter tiles ---------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StageTile
          label="All"
          count={data.counts.all}
          active={stage === "all"}
          onClick={() => setStage("all")}
        />
        {STAGE_TILES.map((s) => (
          <StageTile
            key={s}
            label={STAGE[s].label}
            count={data.counts[s]}
            active={stage === s}
            onClick={() => setStage(stage === s ? "all" : s)}
          />
        ))}
      </div>

      {/* ---- filters ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, hook or writer…"
          className="h-9 w-72 rounded-[var(--radius-control)] border border-[var(--control-border)] bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
        />
        <Select className="h-9 w-44" value={angle} onChange={(e) => setAngle(e.target.value)}>
          <option value="">All angles</option>
          {data.angles.map((a) => (
            <option key={a.id} value={a.label}>
              {a.label}
            </option>
          ))}
        </Select>
        <Select className="h-9 w-44" value={writer} onChange={(e) => setWriter(e.target.value)}>
          <option value="">All writers</option>
          {data.writers.map((w) => (
            <option key={w.id} value={w.name}>
              {w.name}
            </option>
          ))}
        </Select>
        {filtered && (
          <button
            onClick={() => {
              setStage("all");
              setQ("");
              setAngle("");
              setWriter("");
            }}
            className="text-sm font-medium text-brand hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted">
            {rows.length} script{rows.length === 1 ? "" : "s"}
          </span>
          <Button onClick={newScript} disabled={creating}>
            {creating ? "Creating…" : "New script"}
          </Button>
        </span>
      </div>

      {createErr && (
        <p className="rounded-[var(--radius-control)] bg-red-bg px-3 py-2 text-sm text-red">
          {createErr}
        </p>
      )}

      {/* ---- list -------------------------------------------------------- */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface py-20 text-center">
          <div className="text-sm font-medium text-ink-2">
            {data.counts.all === 0
              ? "No scripts yet — write the first one."
              : "No script matches these filters."}
          </div>
          {data.counts.all === 0 ? (
            <Button onClick={newScript} disabled={creating}>
              {creating ? "Creating…" : "New script"}
            </Button>
          ) : (
            <button
              onClick={() => {
                setStage("all");
                setQ("");
                setAngle("");
                setWriter("");
              }}
              className="text-sm font-medium text-brand hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <div className="min-w-[880px]">
            <div
              className={`grid items-center gap-3 border-b border-line-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted ${GRID}`}
            >
              <span>Script</span>
              <span>Stage</span>
              <span>Writer</span>
              <span className="text-right">Updated</span>
            </div>

            {rows.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className={`grid w-full items-center gap-3 border-b border-line-2 px-4 py-3 text-left text-sm last:border-0 hover:bg-surface-2 ${GRID}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{s.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {s.angle && <Chip className="bg-brand-chip text-brand-deep">{s.angle}</Chip>}
                    {s.personas.map((p) => (
                      <Chip key={p} className="bg-surface-2 text-ink-3">
                        {p}
                      </Chip>
                    ))}
                    {s.format && <Chip className="bg-surface-2 text-muted">{s.format}</Chip>}
                  </span>
                </span>
                <span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-medium ${STAGE[s.stage].tone}`}
                  >
                    <i className={`h-1.5 w-1.5 rounded-full ${STAGE[s.stage].dot}`} />
                    {STAGE[s.stage].label}
                  </span>
                </span>
                <span className="truncate text-ink-2">{s.writer}</span>
                <span className="text-right font-mono text-[13px] text-ink-3">
                  {fmtDate(s.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {openId && (
        <ScriptDrawer
          id={openId}
          taxonomy={taxonomy}
          perms={perms}
          // Refresh the list on the way out rather than while the drawer is
          // still fetching — two server round trips at once on a small instance
          // is what made opening a script feel slow.
          onClose={() => {
            setOpenId(null);
            router.refresh();
          }}
          onChanged={() => router.refresh()}
        />
      )}

    </div>
  );
}

function StageTile({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[var(--radius-card)] border bg-surface p-4 text-left transition ${
        active ? "border-brand bg-brand-chip" : "border-line hover:bg-surface-2"
      }`}
    >
      <div
        className={`text-[11px] font-medium uppercase tracking-wide ${
          active ? "text-brand-deep" : "text-muted"
        }`}
      >
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-bold ${active ? "text-brand-deep" : "text-ink"}`}>
        {count}
      </div>
    </button>
  );
}
