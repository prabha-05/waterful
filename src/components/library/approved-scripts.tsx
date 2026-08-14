"use client";

import { useState } from "react";
import type { ApprovedScript } from "@/lib/data/scripts";
import type { Taxonomy } from "@/lib/data/taxonomy";
import { Chip } from "@/components/ui/primitives";
import { UploadButton } from "./upload-button";

/**
 * "Approved scripts waiting on you" — the handoff from the Script Library into
 * the Creative Library.
 *
 * This is the Content team's only view of a script: they have no `script`
 * permission, so the Script Library is closed to them. The full text has to be
 * readable here, and the upload has to start here — pointing them at a page
 * they cannot open would be a dead end.
 */
export function ApprovedScripts({
  scripts,
  taxonomy,
  canUpload,
}: {
  scripts: ApprovedScript[];
  taxonomy: Taxonomy;
  canUpload: boolean;
}) {
  const [reading, setReading] = useState<ApprovedScript | null>(null);
  if (scripts.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Approved scripts waiting on you</h3>
        <span className="text-[11px] text-muted">{scripts.length} ready to shoot</span>
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

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setReading(s)}
                className="text-sm font-medium text-brand hover:underline"
              >
                Read script
              </button>
              {canUpload && (
                <UploadButton
                  taxonomy={taxonomy}
                  label="Upload creative"
                  script={{
                    id: s.id,
                    code: s.code,
                    title: s.title,
                    angleId: s.angleId,
                    typeId: s.typeId,
                    subtypeId: s.subtypeId,
                    awarenessId: s.awarenessId,
                    hookId: s.hookId,
                    personaIds: s.personaIds,
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {reading && (
        <ReadScript
          script={reading}
          taxonomy={taxonomy}
          canUpload={canUpload}
          onClose={() => setReading(null)}
        />
      )}
    </section>
  );
}

/** The whole script, readable without leaving the Creative Library. */
function ReadScript({
  script,
  taxonomy,
  canUpload,
  onClose,
}: {
  script: ApprovedScript;
  taxonomy: Taxonomy;
  canUpload: boolean;
  onClose: () => void;
}) {
  const download = () => {
    const text = [
      script.title,
      `${script.code} · ${script.writer}`,
      [script.angle, script.personas.join(", "), script.format, script.runtime ? `${script.runtime}s` : null]
        .filter(Boolean)
        .join(" · "),
      "",
      script.hookLine ? `HOOK — ${script.hookLine}` : "",
      "",
      script.body,
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${script.code} ${script.title}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[rgba(20,40,60,0.35)] animate-[fadeIn_.15s_ease]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[0_24px_60px_rgba(20,40,60,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <span className="font-mono text-[11px] text-muted">
              {script.code} · {script.writer}
              {script.words ? ` · ${script.words} words` : ""}
              {script.runtime ? ` · ~${script.runtime}s` : ""}
            </span>
            <h3 className="truncate text-base font-bold text-ink">{script.title}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {script.hookLine && (
            <div className="mb-4 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Hook{script.hook ? ` · ${script.hook}` : ""}
              </p>
              <p className="mt-0.5 text-sm font-medium text-ink-2">{script.hookLine}</p>
            </div>
          )}
          {/* Monospace and pre-wrap so the timecode column survives. */}
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.7] text-ink-2">
            {script.body || "This script has no body yet."}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={download} className="text-sm font-medium text-brand hover:underline">
            ⬇ Download
          </button>
          {canUpload && (
            <UploadButton
              taxonomy={taxonomy}
              label="Upload creative"
              script={{
                id: script.id,
                code: script.code,
                title: script.title,
                angleId: script.angleId,
                typeId: script.typeId,
                subtypeId: script.subtypeId,
                awarenessId: script.awarenessId,
                hookId: script.hookId,
                personaIds: script.personaIds,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
