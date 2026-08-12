"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABEL, STAGE_TILES, STAGE_TONE, type ScriptStage } from "@/lib/script-stage";
import type { ScriptLibrary } from "@/lib/data/scripts";
import { createScript } from "@/app/actions/scripts";
import { Button, Chip, Field, Input, Modal, Select } from "@/components/ui/primitives";
import { useDate } from "@/components/providers/settings-provider";
import { ScriptDrawer } from "./script-drawer";

const GRID = "grid-cols-[minmax(200px,2fr)_140px_130px_130px_56px_88px]";

export function ScriptsClient({
  data,
  creators,
}: {
  data: ScriptLibrary;
  creators: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fmtDate = useDate();
  const [stage, setStage] = useState<ScriptStage | "all">("all");
  const [q, setQ] = useState("");
  const [angle, setAngle] = useState("");
  const [writer, setWriter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* ---- stage pipeline as filter tiles ---------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StageTile
          label="All"
          count={data.counts.all}
          active={stage === "all"}
          onClick={() => setStage("all")}
        />
        {STAGE_TILES.map((s) => (
          <StageTile
            key={s}
            label={STAGE_LABEL[s]}
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
          <Button onClick={() => setCreating(true)}>New script</Button>
        </span>
      </div>

      {/* ---- list -------------------------------------------------------- */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface py-20 text-center">
          <div className="text-sm font-medium text-ink-2">
            {data.counts.all === 0
              ? "No scripts yet — write the first one."
              : "No script matches these filters."}
          </div>
          {data.counts.all === 0 ? (
            <Button onClick={() => setCreating(true)}>New script</Button>
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
              <span>Creator</span>
              <span className="text-right">Ver</span>
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
                    {s.persona && <Chip className="bg-surface-2 text-ink-3">{s.persona}</Chip>}
                    {s.type && (
                      <Chip className="bg-surface-2 text-muted">
                        {s.type}
                        {s.runtime ? ` · ${s.runtime}s` : ""}
                      </Chip>
                    )}
                  </span>
                </span>
                <span>
                  <Chip className={STAGE_TONE[s.stage]}>{STAGE_LABEL[s.stage]}</Chip>
                </span>
                <span className="truncate text-ink-2">{s.writer}</span>
                <span className="truncate text-ink-3">{s.creator ?? "—"}</span>
                <span className="text-right font-mono text-ink-3">v{s.version}</span>
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
          creators={creators}
          angles={data.angles}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      <NewScriptModal
        open={creating}
        angles={data.angles}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          router.refresh();
          setOpenId(id);
        }}
      />
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

function NewScriptModal({
  open,
  angles,
  onClose,
  onCreated,
}: {
  open: boolean;
  angles: { id: string; label: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [angleId, setAngleId] = useState("");
  const [type, setType] = useState("Video");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await createScript({ title, hookLine: hook, angleId, type });
      if (!res.ok) return setErr(res.error ?? "Couldn't create the script.");
      setTitle("");
      setHook("");
      setAngleId("");
      onCreated(res.id!);
    });
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <b className="text-base font-bold text-ink">New script</b>
        <button onClick={onClose} className="text-muted hover:text-ink">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="I stopped fading at rep 8"
          />
        </Field>
        <Field label="Hook line">
          <Input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="The first line the viewer hears"
          />
        </Field>
        <Field label="Angle">
          <Select value={angleId} onChange={(e) => setAngleId(e.target.value)}>
            <option value="">Not decided yet</option>
            {angles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Intended format">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option>Video</option>
            <option>Static</option>
            <option>Carousel</option>
          </Select>
        </Field>
        {err && <p className="text-sm text-red">{err}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Creating…" : "Create draft"}
        </Button>
      </div>
    </Modal>
  );
}
