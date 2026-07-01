"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CreativeCard } from "@/lib/data/creatives";
import type { Taxonomy } from "@/lib/data/taxonomy";
import type { Permissions } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { linkAd } from "@/app/actions/creatives";
import { Button, Chip, Field, Input, Modal, StatusPill } from "@/components/ui/primitives";
import { TYPE_TINT } from "@/lib/status";

export function AwaitingClient({
  items,
  perms,
}: {
  items: CreativeCard[];
  taxonomy: Taxonomy;
  perms: Permissions;
}) {
  const router = useRouter();
  const [linkFor, setLinkFor] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <div className="text-2xl">✓</div>
        <p className="text-sm font-medium text-ink-2">All caught up</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-6">
      {items.map((c) => (
        <div key={c.id} className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${TYPE_TINT[c.type] ?? "bg-surface-2"}`}>
            <span className="font-mono text-[9px] font-semibold uppercase text-ink-2/70">{c.type}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{c.title}</span>
              <StatusPill status={c.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <Chip className="bg-brand-chip text-brand-deep">{c.angle}</Chip>
              {c.personas.slice(0, 2).map((p) => <Chip key={p} className="bg-surface-2 text-ink-3">{p}</Chip>)}
              <span>· {c.type}/{c.subtype} · {formatDate(c.createdAt)}</span>
            </div>
          </div>
          {perms.link ? (
            <Button variant="secondary" onClick={() => setLinkFor(c.id)}>Link Ad ID</Button>
          ) : (
            <Chip className="bg-amber-bg text-amber">Awaiting Performance</Chip>
          )}
        </div>
      ))}

      {linkFor && (
        <LinkModal
          creativeId={linkFor}
          onClose={() => setLinkFor(null)}
          onLinked={() => { setLinkFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function LinkModal({
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
        <p className="mt-2 text-xs text-muted">Campaign / metrics auto-pull from Meta; the creative goes Live.</p>
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          disabled={pending || !adId.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await linkAd(creativeId, adId);
              if (!r.ok) setError(r.error ?? "Link failed.");
              else onLinked();
            })
          }
        >
          {pending ? "Linking…" : "Link Ad ID"}
        </Button>
      </div>
    </Modal>
  );
}
