"use client";

import type { CreativeCard as Card } from "@/lib/data/creatives";
import { formatRoas } from "@/lib/format";
import { TYPE_TINT } from "@/lib/status";
import { Chip, ScorePill, StatusPill } from "@/components/ui/primitives";
import { useFormat } from "@/components/providers/settings-provider";

export function CreativeCardView({
  card,
  onClick,
}: {
  card: Card;
  onClick: () => void;
}) {
  const fmt = useFormat();
  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-left shadow-[0_1px_2px_rgba(20,40,60,0.04)] transition hover:border-brand/40 hover:shadow-md"
    >
      {/* Thumbnail — real file if available, else type-tinted placeholder */}
      <div
        className={`relative flex h-28 items-center justify-center overflow-hidden ${TYPE_TINT[card.type] ?? "bg-surface-2"}`}
      >
        {card.thumbUrl ? (
          card.type === "Video" ? (
            <>
              <video
                src={`${card.thumbUrl}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
              <span className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white">
                ▶
              </span>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.thumbUrl} alt={card.title} className="h-full w-full object-cover" />
          )
        ) : (
          <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ink-2/70">
            {card.type}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            {card.type} · {card.subtype}
            {card.adCount > 0 && ` · ${card.adCount} ad${card.adCount > 1 ? "s" : ""}`}
          </span>
          <StatusPill status={card.status} />
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold text-ink">{card.title}</h3>

        <div className="flex flex-wrap gap-1">
          <Chip className="bg-brand-chip text-brand-deep">{card.angle}</Chip>
          {card.personas.slice(0, 2).map((p) => (
            <Chip key={p} className="bg-surface-2 text-ink-3">
              {p}
            </Chip>
          ))}
          {card.personas.length > 2 && (
            <Chip className="bg-surface-2 text-muted">+{card.personas.length - 2}</Chip>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-2.5 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Spend</div>
            <div className="font-mono font-medium text-ink">{fmt(card.spend)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">ROAS</div>
            <div className="font-mono font-medium text-ink">
              {card.spend > 0 ? formatRoas(card.roas) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted">Score</div>
            <ScorePill score={card.spend > 0 ? card.score : null} />
          </div>
        </div>
      </div>
    </button>
  );
}
