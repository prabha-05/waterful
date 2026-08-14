"use client";

import { useEffect, useState, useTransition } from "react";
import { STAGE, isDeletable, isEditable, type ScriptStage } from "@/lib/script-stage";
import type { ScriptDetail } from "@/lib/data/scripts";
import type { Taxonomy } from "@/lib/data/taxonomy";
import type { Permissions } from "@/lib/auth/permissions";
import { advanceScript, deleteScript, rejectScript, updateScript } from "@/app/actions/scripts";
import { fetchScript } from "@/app/actions/script-read";
import { extractPdfText } from "@/app/actions/script-pdf";
import { Button, Drawer, Select, Textarea } from "@/components/ui/primitives";
import { useDate } from "@/components/providers/settings-provider";

export function ScriptDrawer({
  id,
  creators,
  taxonomy,
  perms,
  onClose,
  onChanged,
}: {
  id: string;
  creators: { id: string; name: string; role: string }[];
  taxonomy: Taxonomy;
  perms: Permissions;
  onClose: () => void;
  onChanged: () => void;
}) {
  const fmtDate = useDate();
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // edit buffer
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [angleId, setAngleId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [awarenessId, setAwarenessId] = useState("");
  const [hookId, setHookId] = useState("");
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    const s = await fetchScript(id);
    setScript(s);
    if (s) {
      setTitle(s.title);
      setHook(s.hookLine);
      setBody(s.body);
      setAngleId(s.angleId ?? "");
      setTypeId(s.typeId ?? "");
      setSubtypeId(s.subtypeId ?? "");
      setAwarenessId(s.awarenessId ?? "");
      setHookId(s.hookId ?? "");
      setPersonaIds(s.personaIds);
      setCreatorId(s.creatorId ?? "");
      setDirty(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setErr(res.error ?? "Something went wrong.");
      await load();
      onChanged();
    });
  };

  const stage = script?.stage as ScriptStage | undefined;
  const def = stage ? STAGE[stage] : null;
  const editable = stage ? isEditable(stage) : false;
  const canEdit = editable && perms.script;
  // The gate is per-stage: approving needs `master`, everything else `script`.
  const canAdvance = def?.gate ? perms[def.gate] : false;
  // Chosen before review, so the approver can see who is shooting it.
  const needsCreator = def?.needsCreator === true;
  const missingCreator = needsCreator && !creatorId;
  // Deletable until an admin approves it. After that the approval is a record;
  // Request changes reverses it first and makes the script deletable again.
  const canDelete = perms.script && stage !== undefined && isDeletable(stage);

  const doDelete = () => {
    setErr(null);
    start(async () => {
      const res = await deleteScript(id);
      if (!res.ok) {
        setConfirmDelete(false);
        return setErr(res.error ?? "Delete failed.");
      }
      onChanged();
      onClose();
    });
  };

  // Personas offered are those mapped to the chosen angle (same rule as upload).
  const allowedIds = new Set(taxonomy.anglePersonaMap[angleId] ?? []);
  const allowedPersonas = angleId ? taxonomy.personas.filter((p) => allowedIds.has(p.id)) : [];
  const subtypes = taxonomy.types.find((t) => t.id === typeId)?.subtypes ?? [];

  const download = () => {
    if (!script) return;
    const text = [
      script.title,
      `${script.code} · v${script.version} · ${script.writer}`,
      [script.angle, script.personas.join(", "), script.format, script.runtime ? `${script.runtime}s` : null]
        .filter(Boolean)
        .join(" · "),
      "",
      script.hookLine ? `HOOK — ${script.hookLine}` : "",
      "",
      script.body,
      "",
      script.noteTitle
        ? `NOTE — ${script.noteTitle}${script.noteTone ? ` (${script.noteTone})` : ""}`
        : "",
      "",
      `Written by ${script.writer} · updated ${new Date(script.updatedAt).toLocaleDateString("en-IN")}`,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${script.code} ${script.title}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onPdf = async (file: File) => {
    setPdfNote(null);
    setErr(null);
    setPdfBusy(true);
    const form = new FormData();
    form.set("file", file);
    const res = await extractPdfText(form);
    setPdfBusy(false);
    if (!res.ok) return setErr(res.error);
    // Replace the body — the writer chose to import, so the PDF wins.
    setBody(res.text);
    setDirty(true);
    setPdfNote(`Imported ${res.pages} page${res.pages === 1 ? "" : "s"} — review it, then save.`);
  };

  const save = () =>
    run(() =>
      updateScript(id, {
        title,
        hookLine: hook,
        body,
        angleId,
        typeId,
        subtypeId,
        awarenessId,
        hookId,
        personaIds,
        creatorId,
      }),
    );

  return (
    <Drawer open onClose={onClose} width={720}>
      {loading || !script || !def ? (
        <div className="p-6 text-sm text-muted">{loading ? "Loading…" : "Script not found."}</div>
      ) : (
        <>
          {/* ---- header ------------------------------------------------- */}
          <div className="border-b border-line px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-medium ${def.tone}`}
                >
                  <i className={`h-1.5 w-1.5 rounded-full ${def.dot}`} />
                  {def.label}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {script.code} · v{script.version}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={download}>
                  ⬇ Download
                </Button>
                <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
                  ✕
                </button>
              </div>
            </div>
            <input
              value={title}
              disabled={!canEdit}
              onChange={(e) => touch(setTitle)(e.target.value)}
              className="mt-3 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-surface px-3 py-2 text-base font-bold text-ink outline-none focus:border-brand disabled:border-transparent disabled:bg-transparent disabled:px-0"
            />
            <p className="mt-1 text-[11px] text-muted">
              Written by {script.writer} · updated {fmtDate(script.updatedAt)}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto bg-background px-5 py-4">
            <div className="flex flex-col gap-4">
              {script.creative && (
                <div className="rounded-[var(--radius-control)] bg-green-bg px-3 py-2 text-sm text-green">
                  Creative received — “{script.creative.title}” was uploaded against this script.
                </div>
              )}

              {/* ---- tagging ------------------------------------------- */}
              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold text-ink">
                  Tagging{" "}
                  <span className="font-normal text-muted">
                    · from Master Data · the creative inherits all of it
                  </span>
                </h3>

                <div className="mt-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-2">Angle</span>
                    <Select
                      value={angleId}
                      disabled={!canEdit}
                      onChange={(e) => {
                        touch(setAngleId)(e.target.value);
                        setPersonaIds([]); // personas are mapped to the angle
                      }}
                    >
                      <option value="">Not decided yet</option>
                      {taxonomy.angles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-2">
                      Personas{" "}
                      <span className="font-normal text-muted">
                        · mapped to the angle · pick one or more
                      </span>
                    </span>
                    {!angleId ? (
                      <p className="text-sm text-muted">Choose an angle first.</p>
                    ) : allowedPersonas.length === 0 ? (
                      <p className="text-sm text-muted">No personas mapped to this angle yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {allowedPersonas.map((p) => {
                          const on = personaIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={!canEdit}
                              aria-pressed={on}
                              onClick={() =>
                                touch(setPersonaIds)(
                                  on ? personaIds.filter((x) => x !== p.id) : [...personaIds, p.id],
                                )
                              }
                              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition ${
                                on
                                  ? "border-brand bg-brand-chip text-brand-deep"
                                  : "border-line bg-surface text-ink-3 hover:bg-surface-2"
                              } disabled:opacity-60`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-2">
                      Content person{" "}
                      <span className="font-normal text-muted">· who will shoot this</span>
                    </span>
                    <Select
                      value={creatorId}
                      disabled={!canEdit}
                      onChange={(e) => touch(setCreatorId)(e.target.value)}
                    >
                      <option value="">Not chosen yet</option>
                      {creators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.role}
                        </option>
                      ))}
                    </Select>
                    {missingCreator && canEdit && (
                      <span className="text-[11px] text-amber">
                        Needed before this can go for review.
                      </span>
                    )}
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Type</span>
                      <Select
                        value={typeId}
                        disabled={!canEdit}
                        onChange={(e) => {
                          touch(setTypeId)(e.target.value);
                          setSubtypeId("");
                        }}
                      >
                        <option value="">—</option>
                        {taxonomy.types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Sub-type</span>
                      <Select
                        value={subtypeId}
                        disabled={!canEdit || !typeId}
                        onChange={(e) => touch(setSubtypeId)(e.target.value)}
                      >
                        <option value="">—</option>
                        {subtypes.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Awareness stage</span>
                      <Select
                        value={awarenessId}
                        disabled={!canEdit}
                        onChange={(e) => touch(setAwarenessId)(e.target.value)}
                      >
                        <option value="">—</option>
                        {taxonomy.awareness.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Hook type</span>
                      <Select
                        value={hookId}
                        disabled={!canEdit}
                        onChange={(e) => touch(setHookId)(e.target.value)}
                      >
                        <option value="">—</option>
                        {taxonomy.hooks.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                </div>
              </section>

              {/* ---- hook line ----------------------------------------- */}
              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Hook{script.hook ? ` · ${script.hook}` : ""}
                </p>
                <input
                  value={hook}
                  disabled={!canEdit}
                  placeholder="The first line the viewer hears"
                  onChange={(e) => touch(setHook)(e.target.value)}
                  className="mt-1 w-full bg-transparent text-sm text-ink-2 outline-none placeholder:text-muted"
                />
              </section>

              {/* ---- the script ---------------------------------------- */}
              <section className="rounded-[var(--radius-card)] border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <h3 className="text-sm font-semibold text-ink">Script</h3>
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <label
                        className={`cursor-pointer text-sm font-medium text-brand hover:underline ${
                          pdfBusy ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        {pdfBusy ? "Reading…" : "⬆ Upload PDF"}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void onPdf(f);
                          }}
                        />
                      </label>
                    )}
                    <span className="font-mono text-[11px] text-muted">
                      {script.words} words · {script.runtime ? `${script.runtime}s` : "—"}
                      {script.format ? ` · ${script.format}` : ""}
                    </span>
                  </div>
                </div>
                {pdfNote && (
                  <p className="border-b border-line-2 bg-green-bg px-4 py-2 text-[13px] text-green">
                    {pdfNote}
                  </p>
                )}
                <div className="p-3">
                  <Textarea
                    value={body}
                    disabled={!canEdit}
                    placeholder="The full script, as the creator will read it."
                    onChange={(e) => touch(setBody)(e.target.value)}
                    // The script is the point of this screen — give it real room
                    // and a mono face so the timecode column lines up.
                    className="min-h-[460px] resize-y font-mono text-[13px] leading-[1.7] disabled:bg-surface"
                  />
                </div>
              </section>

              {dirty && canEdit && (
                <div className="flex justify-end">
                  <Button onClick={save} disabled={pending}>
                    {pending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}

              {/* ---- activity ------------------------------------------ */}
              <section className="rounded-[var(--radius-card)] border border-line bg-surface">
                <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
                  Activity
                </h3>
                {script.activity.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">Nothing logged yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line-2">
                    {script.activity.map((a, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                        <span className="text-sm text-ink-2">
                          <span className="font-medium text-ink">{a.actor}</span> {a.text}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {fmtDate(a.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* ---- pipeline actions ------------------------------------- */}
          <div className="border-t border-line bg-surface px-5 py-3">
            {err && <p className="mb-2 text-sm text-red">{err}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted">
                {!perms.script
                  ? "Editing and submitting require Write scripts."
                  : missingCreator
                    ? "Choose a content person above before sending for review."
                    : def.next
                      ? `Next: ${STAGE[def.next].label}`
                      : "End of the pipeline"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {canDelete &&
                  (!confirmDelete ? (
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete
                    </Button>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-medium text-red">
                        {script.creative
                          ? `Delete permanently? “${script.creative.title}” stays, unlinked.`
                          : "Delete permanently?"}
                      </span>
                      <Button variant="danger" disabled={pending} onClick={doDelete}>
                        {pending ? "Deleting…" : "Yes, delete"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </span>
                  ))}
                {perms.script && stage !== "changes" && stage !== "draft" && (
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => run(() => rejectScript(id))}
                  >
                    Request changes
                  </Button>
                )}
                {def.next && (
                  <Button
                    disabled={pending || !canAdvance || missingCreator}
                    title={
                      !canAdvance && def.gate === "master"
                        ? "Only someone who can manage master data may approve a script."
                        : undefined
                    }
                    onClick={() =>
                      run(async () => {
                        // Persist any unsaved tagging first, so Advance never
                        // discards edits the writer just made.
                        if (dirty && canEdit) {
                          const saved = await updateScript(id, {
                            title,
                            hookLine: hook,
                            body,
                            angleId,
                            typeId,
                            subtypeId,
                            awarenessId,
                            hookId,
                            personaIds,
                            creatorId,
                          });
                          if (!saved.ok) return saved;
                        }
                        return advanceScript(id, creatorId || undefined);
                      })
                    }
                  >
                    {pending ? "Working…" : def.action}
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
