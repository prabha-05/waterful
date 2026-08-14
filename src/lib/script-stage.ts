import type { Permission } from "@/lib/auth/permissions";

/**
 * Script pipeline vocabulary. Client-safe by design (same role as lib/status.ts
 * and lib/score.ts) — the list, the tiles and the drawer all read from here.
 *
 * The action label and the permission are per-stage, straight from the design
 * prototype's `scriptStageDefs()`. The gate matters: approving a script needs
 * `master`, NOT `script`, so a writer cannot approve their own work.
 */
export type ScriptStage =
  | "draft"
  | "review"
  | "changes"
  | "approved"
  | "creators"
  | "received";

type StageDef = {
  label: string;
  /** What the primary button says when a script is sitting in this stage. */
  action: string;
  /** Stage it moves to. Null = end of the pipeline. */
  next: ScriptStage | null;
  /** Permission required to make that move. */
  gate: Permission | null;
  /** Pill classes — text + background. */
  tone: string;
  /** Dot colour inside the pill. */
  dot: string;
};

export const STAGE: Record<ScriptStage, StageDef> = {
  draft: {
    label: "Draft",
    action: "Send for review",
    next: "review",
    gate: "script",
    tone: "text-ink-3 bg-line-2",
    dot: "bg-muted",
  },
  review: {
    label: "In review",
    action: "Approve script",
    next: "approved",
    // Deliberately `master`: the writer submits, someone else approves.
    gate: "master",
    tone: "text-amber bg-amber-bg",
    dot: "bg-amber",
  },
  changes: {
    label: "Changes",
    action: "Resubmit for review",
    next: "review",
    gate: "script",
    tone: "text-red bg-red-bg",
    dot: "bg-red",
  },
  approved: {
    // The end of the Script Library's job. An approved script is locked — not
    // editable, not deletable — and appears on the Creative Library for Content
    // to shoot. It moves again only when a creative is uploaded against it.
    label: "Approved",
    action: "",
    next: null,
    gate: null,
    tone: "text-green bg-green-bg",
    dot: "bg-green",
  },
  creators: {
    label: "With content",
    action: "Mark creative received",
    next: "received",
    gate: "script",
    tone: "text-brand-deep bg-brand-chip",
    dot: "bg-brand",
  },
  received: {
    label: "Creative received",
    action: "",
    next: null,
    gate: null,
    tone: "text-ink-2 bg-line-2",
    dot: "bg-muted",
  },
};

/** Tile order on screen — the pipeline as a person reads it. */
export const STAGE_TILES: ScriptStage[] = [
  "draft",
  "review",
  "changes",
  "approved",
  "received",
];

export const STAGE_LABEL = Object.fromEntries(
  Object.entries(STAGE).map(([k, v]) => [k, v.label]),
) as Record<ScriptStage, string>;

export const STAGE_TONE = Object.fromEntries(
  Object.entries(STAGE).map(([k, v]) => [k, v.tone]),
) as Record<ScriptStage, string>;

export function nextStage(stage: ScriptStage): ScriptStage | null {
  return STAGE[stage].next;
}

/**
 * Stages a script can still be deleted in — everything BEFORE an admin has
 * approved it. Once approved it is a record of a decision, and the way to undo
 * that is Request changes, which reverses the approval deliberately and makes
 * the script deletable again.
 */
export const DELETABLE_STAGES: ScriptStage[] = ["draft", "changes", "review"];
export const isDeletable = (s: ScriptStage) => DELETABLE_STAGES.includes(s);

/**
 * Stages where the wording is still open. Approval closes it: from that moment
 * Content is working from what they can see, and an edit behind their back
 * would mean shooting one version while the library shows another.
 */
export const EDITABLE_STAGES: ScriptStage[] = ["draft", "changes", "review"];
export const isEditable = (s: ScriptStage) => EDITABLE_STAGES.includes(s);
