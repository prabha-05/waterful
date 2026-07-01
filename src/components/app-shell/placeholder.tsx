/** Phase-0 placeholder body. Each screen is built for real in its phase (§8). */
export function Placeholder({ phase, note }: { phase: string; note: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-md rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-8 text-center">
        <div className="mb-2 inline-block rounded-full bg-brand-chip px-2.5 py-1 text-xs font-semibold text-brand-deep">
          {phase}
        </div>
        <p className="text-sm leading-relaxed text-ink-3">{note}</p>
      </div>
    </div>
  );
}
