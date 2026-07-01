"use client";

import { useState } from "react";

/** "?" popover explaining the Creative Score (README §3 / BUILD_GUIDE §6). */
export function ScoreExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-xs font-semibold text-muted hover:bg-surface-2"
        aria-label="How the score works"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-72 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-xs leading-relaxed text-ink-3 shadow-[0_12px_32px_rgba(20,40,60,0.14)]">
          <p className="mb-2 text-sm font-semibold text-ink">Creative Score (0–100)</p>
          <p>
            Blends <b>ROAS quality</b> (break-even at 1.0×, best at 3×+) with{" "}
            <b>spend confidence</b> (log-scaled — trust grows with scale).
          </p>
          <p className="mt-2">
            High ROAS at tiny spend stays near neutral; losing money at high spend is
            punished hardest.
          </p>
          <div className="mt-2 flex gap-3 font-medium">
            <span className="text-green">≥70 strong</span>
            <span className="text-amber">50–69</span>
            <span className="text-red">&lt;50 weak</span>
          </div>
        </div>
      )}
    </div>
  );
}
