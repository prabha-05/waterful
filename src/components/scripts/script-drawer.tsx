"use client";

import { useEffect, useState, useTransition } from "react";
import { STAGE_LABEL, STAGE_TONE, nextStage, type ScriptStage } from "@/lib/script-stage";
import type { ScriptDetail } from "@/lib/data/scripts";
import { advanceScript, rejectScript, updateScript } from "@/app/actions/scripts";
import { fetchScript } from "@/app/actions/script-read";
import { Button, Chip, Drawer, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useDate } from "@/components/providers/settings-provider";

/** Stages where the wording is still open. Past that it is out being shot. */
const EDITABLE: ScriptStage[] = ["draft", "changes", "review", "approved"];

export function ScriptDrawer({
  id,
  creators,
  angles,
  onClose,
  onChanged,
}: {
  id: string;
  creators: { id: string; name: string }[];
  angles: { id: string; label: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const fmtDate = useDate();
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // local edit buffer
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [angleId, setAngleId] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    const s = await fetchScript(id);
    setScript(s);
    if (s) {
      setTitle(s.title);
      setHook(s.hookLine);
      setBody(s.body);
      setAngleId(s.angleId ?? "");
      setCreatorId(s.creatorId ?? "");
      setDirty(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setErr(res.error ?? "Something went wrong.");
      await load();
      onChanged();
    });
  };

  const editable = script ? EDITABLE.includes(script.stage) : false;
  const to = script ? nextStage(script.stage) : null;
  const needsCreator = to === "creators";

  const download = () => {
    if (!script) return;
    const lines = [
      script.title,
      `${script.code} · v${script.version} · ${script.writer}`,
      [script.angle, script.persona, script.type, script.runtime ? `${script.runtime}s` : null]
        .filter(Boolean)
        .join(" · "),
      "",
      script.hookLine ? `HOOK: ${script.hookLine}` : "",
      "",
      script.body,
      "",
      script.noteTitle ? `NOTE — ${script.noteTitle}${script.noteTone ? ` (${script.noteTone})` : ""}` : "",
      "",
      `Written by ${script.writer} · updated ${new Date(script.updatedAt).toLocaleDateString("en-IN")}`,
    ];
    const blob = new Blob([lines.filter((l) => l !== undefined).join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${script.code} ${script.title}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Drawer open onClose={onClose} width={640}>
      {loading || !script ? (
        <div className="p-6 text-sm text-muted">{loading ? "Loading…" : "Script not found."}</div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted">{script.code}</span>
                <Chip className={STAGE_TONE[script.stage]}>{STAGE_LABEL[script.stage]}</Chip>
                <span className="font-mono text-[11px] text-muted">v{script.version}</span>
              </div>
              <h2 className="mt-1 truncate text-base font-bold text-ink">{script.title}</h2>
              <p className="text-[11px] text-muted">
                {script.writer} · {script.words} words
                {script.runtime ? ` · ~${script.runtime}s` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={download}>
                ⬇ Download
              </Button>
              <button onClick={onClose} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {script.creative && (
                <div className="rounded-[var(--radius-control)] bg-green-bg px-3 py-2 text-sm text-green">
                  Creative received — “{script.creative.title}” was uploaded against this script.
                </div>
              )}

              <Field label="Title">
                <Input
                  value={title}
                  disabled={!editable}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>

              <Field label="Hook line">
                <Input
                  value={hook}
                  disabled={!editable}
                  onChange={(e) => {
                    setHook(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>

              <Field label="Angle">
                <Select
                  value={angleId}
                  disabled={!editable}
                  onChange={(e) => {
                    setAngleId(e.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">Not decided yet</option>
                  {angles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Script">
                <Textarea
                  rows={14}
                  value={body}
                  disabled={!editable}
                  placeholder="The full script, as the creator will read it."
                  onChange={(e) => {
                    setBody(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>

              {dirty && editable && (
                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      run(() => updateScript(id, { title, hookLine: hook, body, angleId }))
                    }
                    disabled={pending}
                  >
                    {pending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}

              {!editable && (
                <p className="text-[11px] text-muted">
                  This script is {STAGE_LABEL[script.stage].toLowerCase()} — the wording is locked so
                  the version being shot can&apos;t drift from the version here.
                </p>
              )}

              {/* ---- activity trail ---------------------------------- */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Activity</h3>
                {script.activity.length === 0 ? (
                  <p className="text-sm text-muted">Nothing logged yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {script.activity.map((a, i) => (
                      <li key={i} className="border-b border-line-2 pb-3 last:border-0">
                        <p className="text-[11px] text-muted">
                          {fmtDate(a.at)} · {a.actor}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-2">{a.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ---- pipeline actions --------------------------------------- */}
          <div className="border-t border-line px-5 py-3">
            {err && <p className="mb-2 text-sm text-red">{err}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted">
                {to ? `Next: ${STAGE_LABEL[to]}` : "End of the pipeline"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {needsCreator && (
                  <Select
                    className="h-9 w-44"
                    value={creatorId}
                    onChange={(e) => setCreatorId(e.target.value)}
                  >
                    <option value="">Assign a creator…</option>
                    {creators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
                {script.stage !== "changes" && script.stage !== "draft" && (
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => run(() => rejectScript(id))}
                  >
                    Send back
                  </Button>
                )}
                {to && (
                  <Button
                    disabled={pending || (needsCreator && !creatorId)}
                    onClick={() => run(() => advanceScript(id, creatorId || undefined))}
                  >
                    {pending ? "Working…" : `Advance to ${STAGE_LABEL[to]}`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}
