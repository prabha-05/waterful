"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Taxonomy } from "@/lib/data/taxonomy";
import { createCreative } from "@/app/actions/creatives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveFormat, tagLabelFor } from "@/lib/script-format";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives";

/**
 * Grab frame 0 of a video file as a small JPEG, entirely in the browser (the
 * file is already local, so this costs no bandwidth). Stored alongside the
 * video so Library cards render a ~20KB still instead of fetching the video.
 */
function capturePoster(file: File, maxWidth = 320): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadeddata = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((video.videoWidth || maxWidth) * scale);
        canvas.height = Math.round((video.videoHeight || maxWidth) * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.6);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 15000); // never hold up the upload
    video.src = url;
  });
}

/**
 * A script this creative is being uploaded against. Its tagging seeds the form
 * — "the creative inherits all of it" — and the id closes the loop, flipping
 * the script to Creative received on save.
 */
export type UploadFromScript = {
  id: string;
  code: string;
  title: string;
  angleId: string | null;
  typeId: string | null;
  subtypeId: string | null;
  awarenessId: string | null;
  hookId: string | null;
  personaIds: string[];
  /** Dimension tags decided on the script — the creative inherits them. */
  tagIds?: string[];
};

export function UploadButton({
  taxonomy,
  script,
  label = "Upload Creative",
  variant = "primary",
}: {
  taxonomy: Taxonomy;
  script?: UploadFromScript;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <UploadModal taxonomy={taxonomy} script={script} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function UploadModal({
  taxonomy,
  script,
  onClose,
}: {
  taxonomy: Taxonomy;
  script?: UploadFromScript;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Seeded from the script when there is one — the classification was already
  // decided when it was written, so nobody re-picks it from memory.
  const [typeId, setTypeId] = useState(script?.typeId ?? "");
  const [subtypeId, setSubtypeId] = useState(script?.subtypeId ?? "");
  const [angleId, setAngleId] = useState(script?.angleId ?? "");
  const [personaIds, setPersonaIds] = useState<string[]>(script?.personaIds ?? []);
  const [awarenessId, setAwarenessId] = useState(script?.awarenessId ?? "");
  const [hookId, setHookId] = useState(script?.hookId ?? "");
  // The 2026-08-24 dimensions, keyed by group id. Multi-select groups hold
  // several ids; single-select groups hold at most one.
  const [tagsByGroup, setTagsByGroup] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      taxonomy.tagGroups
        .map((g) => [g.id, g.options.filter((o) => (script?.tagIds ?? []).includes(o.id)).map((o) => o.id)] as const)
        .filter(([, ids]) => ids.length > 0),
    ),
  );
  const [title, setTitle] = useState(script?.title ?? "");
  const [reviewLink, setReviewLink] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // From a script the writer has already decided everything: the format comes
  // off its Creative/Content Format tags, so the uploader is never asked again.
  const fromScript = !!script;
  const scriptTagIds = script?.tagIds ?? [];
  const scriptFormat = useMemo(() => {
    if (!script) return null;
    const ids = script.tagIds ?? [];
    return resolveFormat(
      taxonomy.types,
      tagLabelFor(taxonomy.tagGroups, ids, "creative_format"),
      tagLabelFor(taxonomy.tagGroups, ids, "content_format"),
      files.length || 1,
    );
  }, [script, taxonomy, files.length]);

  const selectedType = fromScript
    ? taxonomy.types.find((t) => t.id === scriptFormat?.typeId)
    : taxonomy.types.find((t) => t.id === typeId);
  const isCarousel = selectedType?.label === "Carousel";
  const formatReady = fromScript ? !!scriptFormat?.typeId : !!typeId && !!subtypeId;

  // Persona and Angle are independent — no Angle ↔ Persona filtering.
  const togglePersona = (pid: string) =>
    setPersonaIds((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));

  const valid =
    formatReady &&
    (fromScript || !!angleId) &&
    (fromScript || personaIds.length > 0) &&
    (fromScript || !!title.trim()) &&
    files.length > 0 &&
    !!reviewLink.trim() &&
    !!reviewSummary.trim();

  const acceptFor = () => {
    if (selectedType?.label === "Video") return "video/mp4,video/quicktime";
    return "image/png,image/jpeg";
  };

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await doSubmit();
      } catch (e) {
        // storage-js only *returns* StorageErrors; a network failure, a rejected
        // session or an aborted request is thrown. Before this, that thrown error
        // vanished — the button just went back to "Save" with nothing saved and
        // nothing to tell the person (2026-09-22). Now it is shown and logged.
        console.error("[upload] failed", e);
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Upload failed: ${msg}. Nothing was saved — please try again.`);
      }
    });
  }

  async function doSubmit() {
      // Upload bytes straight to Supabase Storage (direct-to-Storage, decisions §9)
      // so large UGC video never hits the Server Action body limit.
      const supabase = createSupabaseBrowserClient();
      const folder = crypto.randomUUID();
      const uploaded: { storagePath: string; position: number; posterPath?: string | null }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${folder}/${i}_${safe}`;
        const { error } = await supabase.storage
          .from("creatives")
          .upload(path, f, { contentType: f.type || undefined, upsert: true });
        if (error) {
          setError(`File upload failed: ${error.message}`);
          return;
        }

        // Video: also store a small still, so Library cards never download the
        // video just to show a thumbnail. Best-effort — never blocks the upload.
        let posterPath: string | null = null;
        if (f.type.startsWith("video/")) {
          const blob = await capturePoster(f).catch(() => null);
          if (blob) {
            const pPath = `${path.replace(/\.[^./]+$/, "")}_poster.jpg`;
            const { error: pErr } = await supabase.storage
              .from("creatives")
              .upload(pPath, blob, { contentType: "image/jpeg", upsert: true });
            if (!pErr) posterPath = pPath;
          }
        }
        uploaded.push({ storagePath: path, position: i, posterPath });
      }

      const res = await createCreative({
        title,
        angleId,
        awarenessId: awarenessId || null,
        hookId: hookId || null,
        reviewLink,
        reviewSummary,
        typeId: fromScript ? (scriptFormat?.typeId ?? "") : typeId,
        subtypeId: fromScript ? (scriptFormat?.subtypeId ?? "") : subtypeId,
        personaIds,
        tagIds: Object.values(tagsByGroup).flat(),
        files: uploaded,
        scriptId: script?.id ?? null,
      });
      if (!res.ok) {
        setError(res.error ?? "Save failed.");
        return;
      }
      router.refresh();
      onClose();
  }

  return (
    <Modal open onClose={onClose} className="max-w-xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">Upload Creative</h2>
          {script && (
            <p className="truncate font-mono text-[11px] text-muted">
              {script.code} · {script.title}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4">
          {script && (
            <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3">
              <div className="mb-2 text-[13px] font-semibold text-ink-2">
                Tagging{" "}
                <span className="font-normal text-muted">
                  · set on the script · not editable here
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                {[
                  ["Angle", taxonomy.angles.find((a) => a.id === angleId)?.label],
                  // Everything else the writer set, in Master Data order. Its
                  // own value, not the Type/Sub-type these get mapped onto.
                  ...taxonomy.tagGroups
                    .filter((g) => !g.multi)
                    .map((g) => [
                      g.label,
                      g.options.filter((o) => scriptTagIds.includes(o.id)).map((o) => o.label).join(", "),
                    ]),
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="text-ink-2">{(v as string) || "—"}</dd>
                  </div>
                ))}
                {taxonomy.tagGroups
                  .filter((g) => g.multi)
                  .map((g) => {
                    const picked = g.options.filter((o) => scriptTagIds.includes(o.id));
                    return (
                      <div key={g.id} className="col-span-2">
                        <dt className="text-[11px] uppercase tracking-wide text-muted">{g.label}</dt>
                        <dd className="mt-1 flex flex-wrap gap-1">
                          {picked.length === 0 ? (
                            <span className="text-ink-2">—</span>
                          ) : (
                            picked.map((o) => (
                              <span
                                key={o.id}
                                className="inline-flex items-center rounded-[var(--radius-pill)] bg-brand-chip px-2.5 py-0.5 text-[11px] font-medium text-brand-deep"
                              >
                                {o.label}
                              </span>
                            ))
                          )}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
            </div>
          )}

          {/* Format frame — pick first */}
          <div className={fromScript ? "hidden" : "rounded-[var(--radius-control)] border border-line bg-surface-2 p-3"}>
            <div className="mb-2 text-[13px] font-semibold text-ink-2">Format</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" required>
                <Select
                  value={typeId}
                  onChange={(e) => { setTypeId(e.target.value); setSubtypeId(""); setFiles([]); }}
                >
                  <option value="">Select…</option>
                  {taxonomy.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Sub-type" required>
                <Select value={subtypeId} disabled={!typeId} onChange={(e) => setSubtypeId(e.target.value)}>
                  <option value="">Select…</option>
                  {selectedType?.subtypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </Field>
            </div>
          </div>

          {/* Drop zone — disabled until format chosen */}
          <Field label={`File${isCarousel ? "s (Carousel — multiple)" : ""}`} required>
            <input
              type="file"
              disabled={!formatReady}
              multiple={isCarousel}
              accept={acceptFor()}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-surface-2 p-3 text-sm text-ink-3 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white disabled:opacity-50"
            />
          </Field>
          {files.length > 0 && (
            <ul className="-mt-2 text-xs text-muted">
              {files.map((f, i) => <li key={i}>{i + 1}. {f.name}</li>)}
            </ul>
          )}

          {/* Creative review — required */}
          <Field label="Claude review link" required>
            <Input value={reviewLink} onChange={(e) => setReviewLink(e.target.value)} placeholder="https://claude.ai/chat/…" />
          </Field>
          <Field label="Review summary" required>
            <Textarea value={reviewSummary} onChange={(e) => setReviewSummary(e.target.value)} placeholder="What the review concluded…" />
          </Field>

          <div className={script ? "hidden" : "contents"}>
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UGC — morning hydration" />
            </Field>
          </div>

          <div className={fromScript ? "hidden" : "contents"}>
          <div className={script?.personaIds?.length ? "hidden" : "contents"}>
          <Field label="Persona" required>
            <div className="flex flex-wrap gap-2">
              {taxonomy.personas.map((p) => {
                const on = personaIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePersona(p.id)}
                    className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition ${
                      on ? "border-brand bg-brand-chip text-brand-deep" : "border-line bg-surface text-ink-3 hover:bg-surface-2"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
          </div>

          <Field label="Angle" required>
            <Select value={angleId} onChange={(e) => setAngleId(e.target.value)}>
              <option value="">Select…</option>
              {taxonomy.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>

          <TagGroupFields
            groups={taxonomy.tagGroups}
            value={tagsByGroup}
            onChange={setTagsByGroup}
          />
          </div>

        </div>
      </div>

      {/* Error sits in the sticky footer, not at the bottom of a long scroll area,
          so it is seen without scrolling. */}
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        {error && <p className="mr-auto text-sm text-red">{error}</p>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || pending} onClick={submit}>
          {pending ? "Saving…" : "Save to Library"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * One control per Master Data dimension: a dropdown for single-select groups,
 * toggle pills for multi-select ones (Product USP stacks). Renders nothing when
 * no dimensions are defined, so the form is unchanged for anyone who hasn't
 * added any.
 */
export function TagGroupFields({
  groups,
  value,
  onChange,
  required = false,
}: {
  groups: Taxonomy["tagGroups"];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  /** Mark every rendered dimension as required (the script form does). */
  required?: boolean;
}) {
  const usable = groups.filter((g) => g.options.length > 0);
  if (usable.length === 0) return null;

  const set = (groupId: string, ids: string[]) => onChange({ ...value, [groupId]: ids });

  return (
    <>
      {usable.map((g) =>
        g.multi ? (
          <Field key={g.id} label={`${g.label} (pick any)`} required={required}>
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => {
                const on = (value[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() =>
                      set(g.id, on
                        ? (value[g.id] ?? []).filter((x) => x !== o.id)
                        : [...(value[g.id] ?? []), o.id])
                    }
                    className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition ${
                      on ? "border-brand bg-brand-chip text-brand-deep" : "border-line bg-surface text-ink-3 hover:bg-surface-2"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : (
          <Field key={g.id} label={g.label} required={required}>
            <Select
              value={value[g.id]?.[0] ?? ""}
              onChange={(e) => set(g.id, e.target.value ? [e.target.value] : [])}
            >
              <option value="">—</option>
              {g.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
        ),
      )}
    </>
  );
}
