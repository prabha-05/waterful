/** Creative status presentation (README status pills). */
export type CreativeStatus = "draft" | "live" | "paused" | "archived";

export const STATUS_LABEL: Record<CreativeStatus, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  archived: "Archived",
};

export const STATUS_CLASSES: Record<CreativeStatus, string> = {
  draft: "text-ink-3 bg-line-2",
  live: "text-green bg-green-bg",
  paused: "text-amber bg-amber-bg",
  archived: "text-muted bg-line-2",
};

/** Type tint backgrounds for thumbnails (design tokens). */
export const TYPE_TINT: Record<string, string> = {
  Video: "bg-[var(--tint-video)]",
  Static: "bg-[var(--tint-static)]",
  Carousel: "bg-[var(--tint-carousel)]",
};
