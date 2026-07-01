"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CreativeDetail as Detail } from "@/lib/data/creatives";
import type { Taxonomy } from "@/lib/data/taxonomy";
import type { Permissions } from "@/lib/auth/permissions";
import type { CreativeStatus } from "@/lib/status";
import { creativeScore } from "@/lib/score";
import { formatRoas } from "@/lib/format";
import { useDate, useFormat } from "@/components/providers/settings-provider";
import { editTags, linkAd, setArchived, unlinkAd } from "@/app/actions/creatives";
import {
  Button,
  Chip,
  Drawer,
  Field,
  Input,
  Modal,
  ScorePill,
  Select,
  StatusPill,
} from "@/components/ui/primitives";

export function CreativeDetail({
  creativeId,
  taxonomy,
  perms,
  onClose,
  onChanged,
}: {
  creativeId: string | null;
  taxonomy: Taxonomy;
  perms: Permissions;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const fmt = useFormat();
  const fmtDate = useDate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!creativeId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/creatives/${creativeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDetail(d))
      .finally(() => setLoading(false));
  }, [creativeId]);

  const refresh = () => {
    if (creativeId)
      fetch(`/api/creatives/${creativeId}`).then((r) => r.json()).then(setDetail);
    onChanged();
  };

  const totals = useMemo(() => {
    if (!detail) return { spend: 0, roas: 0, score: 50 };
    const spend = detail.ads.reduce((s, a) => s + a.spend, 0);
    const revenue = detail.ads.reduce((s, a) => s + a.revenue, 0);
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, roas, score: creativeScore(spend, roas) };
  }, [detail]);

  function archiveToggle(archived: boolean) {
    if (!detail) return;
    startTransition(async () => {
      const res = await setArchived(detail.id, archived);
      if (res.ok) refresh();
    });
  }

  return (
    <Drawer open={!!creativeId} onClose={onClose}>
      {loading || !detail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Loading…
        </div>
      ) : (
        <>
          <div className="border-b border-line px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <Chip className="bg-surface-2 text-ink-3">{detail.type}</Chip>
              <StatusPill status={detail.status} />
              <ScorePill score={totals.score} />
              <button onClick={onClose} className="ml-auto text-muted hover:text-ink">✕</button>
            </div>
            <h2 className="text-lg font-bold text-ink">{detail.title}</h2>
            <p className="text-xs text-muted">
              Uploaded by {detail.uploadedBy} · {fmtDate(detail.createdAt)}
            </p>
            {perms.upload && (
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>Edit tags</Button>
                {detail.status !== "live" &&
                  (detail.status === "archived" ? (
                    <Button variant="secondary" disabled={pending} onClick={() => archiveToggle(false)}>
                      Restore
                    </Button>
                  ) : (
                    <Button variant="danger" disabled={pending} onClick={() => archiveToggle(true)}>
                      Archive
                    </Button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* File preview(s) */}
            {detail.files.some((f) => f.url) && (
              <div className="mb-4 flex gap-2 overflow-x-auto">
                {detail.files.map((f) =>
                  f.url ? (
                    detail.type === "Video" ? (
                      <video
                        key={f.storagePath}
                        src={`${f.url}#t=0.1`}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-44 rounded-[var(--radius-control)] border border-line bg-black"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={f.storagePath}
                        src={f.url}
                        alt={detail.title}
                        className="h-44 rounded-[var(--radius-control)] border border-line object-cover"
                      />
                    )
                  ) : null,
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detailed label="Angle">{detail.angle}</Detailed>
              <Detailed label="Persona">{detail.personas.join(", ") || "—"}</Detailed>
              <Detailed label="Awareness">{detail.awareness ?? "—"}</Detailed>
              <Detailed label="Hook">{detail.hook ?? "—"}</Detailed>
            </div>

            <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--review)]/30 bg-[var(--review)]/5 p-3">
              <div className="mb-1 text-[13px] font-semibold text-[var(--review)]">Claude review</div>
              <a href={detail.reviewLink} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
                View chat ↗
              </a>
              <p className="mt-1 text-sm text-ink-3">{detail.reviewSummary}</p>
            </div>

            {/* Linked Meta Ads */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">
                  Linked Meta Ads ({detail.ads.length})
                </h3>
                {perms.link && (
                  <Button variant="secondary" onClick={() => setLinking(true)}>Link Ad ID</Button>
                )}
              </div>
              {detail.ads.length === 0 ? (
                <p className="rounded-[var(--radius-control)] border border-dashed border-line bg-surface-2 p-4 text-center text-sm text-muted">
                  No Meta ads linked yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.ads.map((ad) => (
                    <li key={ad.metaAdId} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-ink-2">{ad.metaAdId}</span>
                        <Chip className="bg-surface-2 text-ink-3">{ad.status}</Chip>
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        {ad.campaignId} · {ad.adsetId} · {ad.placement}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <span>Spend <b className="font-mono">{fmt(ad.spend)}</b></span>
                        <span>Rev <b className="font-mono">{fmt(ad.revenue)}</b></span>
                        <span>ROAS <b className="font-mono">{ad.spend > 0 ? formatRoas(ad.roas) : "—"}</b></span>
                        <button
                          onClick={() => router.push(`/ad/${ad.metaAdId}`)}
                          className="ml-auto font-medium text-brand hover:underline"
                        >
                          Show more →
                        </button>
                      </div>
                      {perms.unlink && (
                        <button
                          onClick={() => startTransition(async () => { const r = await unlinkAd(ad.metaAdId); if (r.ok) refresh(); })}
                          className="mt-2 text-xs font-medium text-red hover:underline"
                        >
                          Unlink
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {editing && detail && (
        <EditTagsModal
          detail={detail}
          taxonomy={taxonomy}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh(); }}
        />
      )}
      {linking && detail && (
        <LinkAdModal
          creativeId={detail.id}
          onClose={() => setLinking(false)}
          onLinked={() => { setLinking(false); refresh(); }}
        />
      )}
    </Drawer>
  );
}

function Detailed({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

function EditTagsModal({
  detail,
  taxonomy,
  onClose,
  onSaved,
}: {
  detail: Detail;
  taxonomy: Taxonomy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const findId = (arr: { id: string; label: string }[], label: string | null) =>
    arr.find((x) => x.label === label)?.id ?? "";

  const initialType = taxonomy.types.find((t) => t.label === detail.type);
  const [typeId, setTypeId] = useState(initialType?.id ?? "");
  const [subtypeId, setSubtypeId] = useState(
    initialType?.subtypes.find((s) => s.label === detail.subtype)?.id ?? "",
  );
  const [angleId, setAngleId] = useState(findId(taxonomy.angles, detail.angle));
  const [title, setTitle] = useState(detail.title);
  const [awarenessId, setAwarenessId] = useState(findId(taxonomy.awareness, detail.awareness));
  const [hookId, setHookId] = useState(findId(taxonomy.hooks, detail.hook));
  const [personaIds, setPersonaIds] = useState<string[]>(
    taxonomy.personas.filter((p) => detail.personas.includes(p.label)).map((p) => p.id),
  );

  const selectedType = taxonomy.types.find((t) => t.id === typeId);
  const personaOptions = taxonomy.personas.filter((p) =>
    (taxonomy.anglePersonaMap[angleId] ?? []).includes(p.id),
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await editTags(detail.id, {
        title, typeId, subtypeId, angleId,
        awarenessId: awarenessId || null,
        hookId: hookId || null,
        personaIds,
      });
      if (!res.ok) setError(res.error ?? "Save failed.");
      else onSaved();
    });
  }

  return (
    <Modal open onClose={onClose}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-base font-bold text-ink">Edit tags</h2>
        <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-3">
          <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={typeId} onChange={(e) => { setTypeId(e.target.value); setSubtypeId(""); }}>
              {taxonomy.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select></Field>
            <Field label="Sub-type"><Select value={subtypeId} onChange={(e) => setSubtypeId(e.target.value)}>
              <option value="">Select…</option>
              {selectedType?.subtypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select></Field>
          </div>
          <Field label="Angle"><Select value={angleId} onChange={(e) => { setAngleId(e.target.value); setPersonaIds([]); }}>
            {taxonomy.angles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select></Field>
          <Field label="Persona (mapped to the angle)" required>
            <div className="flex flex-wrap gap-2">
              {personaOptions.map((p) => {
                const on = personaIds.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => setPersonaIds((c) => on ? c.filter((x) => x !== p.id) : [...c, p.id])}
                    className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium ${on ? "border-brand bg-brand-chip text-brand-deep" : "border-line bg-surface text-ink-3"}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Awareness"><Select value={awarenessId} onChange={(e) => setAwarenessId(e.target.value)}>
              <option value="">—</option>
              {taxonomy.awareness.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select></Field>
            <Field label="Hook"><Select value={hookId} onChange={(e) => setHookId(e.target.value)}>
              <option value="">—</option>
              {taxonomy.hooks.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            </Select></Field>
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}

function LinkAdModal({
  creativeId,
  onClose,
  onLinked,
}: {
  creativeId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [adId, setAdId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await linkAd(creativeId, adId);
      if (!res.ok) setError(res.error ?? "Link failed.");
      else onLinked();
    });
  }

  return (
    <Modal open onClose={onClose} className="max-w-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-base font-bold text-ink">Link Meta Ad</h2>
        <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
      </div>
      <div className="px-5 py-4">
        <Field label="Meta Ad ID" required>
          <Input value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="e.g. 120209876543210000" />
        </Field>
        <p className="mt-2 text-xs text-muted">
          Campaign / ad set / placement and all metrics auto-pull from Meta. The creative goes Live on link.
        </p>
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={pending || !adId.trim()} onClick={submit}>
          {pending ? "Linking…" : "Link Ad ID"}
        </Button>
      </div>
    </Modal>
  );
}
