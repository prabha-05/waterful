"use client";

import { useState } from "react";
import type { ScriptRow } from "@/lib/data/scripts";
import { Chip } from "@/components/ui/primitives";

/**
 * "Approved scripts waiting on you" — the handoff from the Script Library into
 * the Creative Library. Sits above the grid so an approved script cannot sit
 * unnoticed while the person who should shoot it is looking at old creatives.
 *
 * Read-only here: uploading against a script happens in the upload flow, which
 * sets `creatives.script_id` and flips the script to Creative received.
 */
export function ApprovedScripts({ scripts }: { scripts: ScriptRow[] }) {
  const [reading, setReading] = useState<ScriptRow | null>(null);
  if (scripts.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Approved scripts waiting on you</h3>
        <span className="text-[11px] text-muted">
          {scripts.length} ready to shoot
        </span>
      </div>

      <div className="flex flex-col divide-y divide-line-2">
        {scripts.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted">{s.code}</span>
                <span className="truncate text-sm font-medium text-ink">{s.title}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {s.angle && <Chip className="bg-brand-chip text-brand-deep">{s.angle}</Chip>}
                {s.personas.map((p) => (
                  <Chip key={p} className="bg-surface-2 text-ink-3">
                    {p}
                  </Chip>
                ))}
                {s.format && (
                  <Chip className="bg-surface-2 text-muted">
                    {s.format}
                    {s.runtime ? ` · ${s.runtime}s` : ""}
                  </Chip>
                )}
                <span className="text-[11px] text-muted">
                  {s.writer}
                  {s.creator ? ` → ${s.creator}` : ""}
                </span>
              </div>
            </div>
            <button
              onClick={() => setReading(s)}
              className="text-sm font-medium text-brand hover:underline"
            >
              Read script
            </button>
          </div>
        ))}
      </div>

      {reading && <ReadScript script={reading} onClose={() => setReading(null)} />}
    </section>
  );
}

function ReadScript({ script, onClose }: { script: ScriptRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[rgba(20,40,60,0.35)] animate-[fadeIn_.15s_ease]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[0_24px_60px_rgba(20,40,60,0.25)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <span className="font-mono text-[11px] text-muted">
              {script.code} · v{script.version}
            </span>
            <h3 className="truncate text-base font-bold text-ink">{script.title}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {script.hookLine && (
            <p className="mb-3 text-sm font-medium text-ink-2">{script.hookLine}</p>
          )}
          <p className="text-[11px] text-muted">
            Open the Script Library for the full text and to download it.
          </p>
        </div>
      </div>
    </div>
  );
}
