"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Taxonomy } from "@/lib/data/taxonomy";
import { createCreative } from "@/app/actions/creatives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
  const [title, setTitle] = useState(script?.title ?? "");
  const [reviewLink, setReviewLink] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const selectedType = taxonomy.types.find((t) => t.id === typeId);
  const isCarousel = selectedType?.label === "Carousel";
  const formatReady = !!typeId && !!subtypeId;

  const personaOptions = useMemo(
    () =>
      taxonomy.personas.filter((p) =>
        (taxonomy.anglePersonaMap[angleId] ?? []).includes(p.id),
      ),
    [taxonomy, angleId],
  );

  const valid =
    formatReady &&
    !!angleId &&
    personaIds.length > 0 &&
    !!title.trim() &&
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
        typeId,
        subtypeId,
        angleId,
        awarenessId: awarenessId || null,
        hookId: hookId || null,
        reviewLink,
        reviewSummary,
        personaIds,
        files: uploaded,
        scriptId: script?.id ?? null,
      });
      if (!res.ok) {
        setError(res.error ?? "Save failed.");
        return;
      }
      router.refresh();
      onClose();
    });
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
                  ["Format", [selectedType?.label, selectedType?.subtypes.find((x) => x.id === subtypeId)?.label].filter(Boolean).join(" · ")],
                  ["Awareness", taxonomy.awareness.find((a) => a.id === awarenessId)?.label],
                  ["Hook", taxonomy.hooks.find((h) => h.id === hookId)?.label],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="text-ink-2">{(v as string) || "—"}</dd>
                  </div>
                ))}
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted">Personas</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {personaIds.length === 0 ? (
                      <span className="text-ink-2">—</span>
                    ) : (
                      personaIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center rounded-[var(--radius-pill)] bg-brand-chip px-2.5 py-0.5 text-[11px] font-medium text-brand-deep"
                        >
                          {taxonomy.personas.find((p) => p.id === id)?.label ?? id}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Format frame — pick first */}
          <div className={script ? "hidden" : "rounded-[var(--radius-control)] border border-line bg-surface-2 p-3"}>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Angle" required>
              <Select value={angleId} onChange={(e) => { setAngleId(e.target.value); setPersonaIds([]); }}>
                <option value="">Select…</option>
                {taxonomy.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </Field>
            <Field label="Awareness">
              <Select value={awarenessId} onChange={(e) => setAwarenessId(e.target.value)}>
                <option value="">—</option>
                {taxonomy.awareness.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Persona (mapped to the angle)" required>
            {!angleId ? (
              <p className="text-xs text-muted">Choose an angle first.</p>
            ) : personaOptions.length === 0 ? (
              <p className="text-xs text-muted">No personas mapped to this angle.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {personaOptions.map((p) => {
                  const on = personaIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPersonaIds((cur) => on ? cur.filter((x) => x !== p.id) : [...cur, p.id])
                      }
                      className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition ${
                        on ? "border-brand bg-brand-chip text-brand-deep" : "border-line bg-surface text-ink-3 hover:bg-surface-2"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="Hook">
            <Select value={hookId} onChange={(e) => setHookId(e.target.value)}>
              <option value="">—</option>
              {taxonomy.hooks.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </Select>
          </Field>
          </div>

          {error && <p className="text-sm text-red">{error}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || pending} onClick={submit}>
          {pending ? "Saving…" : "Save to Library"}
        </Button>
      </div>
    </Modal>
  );
}
