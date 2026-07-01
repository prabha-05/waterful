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

export function UploadButton({ taxonomy }: { taxonomy: Taxonomy }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Creative</Button>
      {open && (
        <UploadModal taxonomy={taxonomy} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function UploadModal({
  taxonomy,
  onClose,
}: {
  taxonomy: Taxonomy;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [angleId, setAngleId] = useState("");
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [awarenessId, setAwarenessId] = useState("");
  const [hookId, setHookId] = useState("");
  const [title, setTitle] = useState("");
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
      const uploaded: { storagePath: string; position: number }[] = [];
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
        uploaded.push({ storagePath: path, position: i });
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
        <h2 className="text-base font-bold text-ink">Upload Creative</h2>
        <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4">
          {/* Format frame — pick first */}
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3">
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
