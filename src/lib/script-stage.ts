/**
 * Script pipeline vocabulary — labels, tones and transitions. Client-safe by
 * design (same role as lib/status.ts and lib/score.ts): the drawer and the list
 * both need these, so they must not live behind `server-only`.
 */
export type ScriptStage =
  | "draft"
  | "review"
  | "changes"
  | "approved"
  | "creators"
  | "received";

/** The advance path. `reject` always returns to `changes`, from anywhere. */
export const STAGE_ORDER: ScriptStage[] = [
  "draft",
  "review",
  "approved",
  "creators",
  "received",
];

export const STAGE_LABEL: Record<ScriptStage, string> = {
  draft: "Draft",
  review: "In review",
  changes: "Changes",
  approved: "Approved",
  creators: "With content",
  received: "Creative received",
};

/** Tile order on screen — the pipeline as a person reads it. */
export const STAGE_TILES: ScriptStage[] = [
  "draft",
  "review",
  "changes",
  "approved",
  "creators",
  "received",
];

export const STAGE_TONE: Record<ScriptStage, string> = {
  draft: "text-ink-3 bg-line-2",
  review: "text-amber bg-amber-bg",
  changes: "text-red bg-red-bg",
  approved: "text-green bg-green-bg",
  creators: "text-brand-deep bg-brand-chip",
  received: "text-muted bg-line-2",
};

/** What `Advance` does next, or null at the end of the pipeline. */
export function nextStage(stage: ScriptStage): ScriptStage | null {
  if (stage === "draft" || stage === "changes") return "review";
  const i = STAGE_ORDER.indexOf(stage);
  if (i === -1 || i === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}
