/**
 * Creative Score — implement exactly per BUILD_GUIDE §6 / decisions §7.
 * 0–100, computed on read. Uses LIFETIME spend (why on-link backfill pulls full
 * history). Validated against the prototype cards:
 *   ₹1.2L @ 3.61× → 94 ; ₹80k @ 2.10× → 72.
 */
export type ScoreBand = "green" | "amber" | "red";

export function creativeScore(spend: number, roas: number): number {
  if (spend <= 0) return 50; // neutral, unproven
  const roasQuality = Math.max(-1, Math.min(1, (roas - 1) / 2)); // break-even 1.0, +1 at ROAS 3
  const spendConfidence = Math.max(
    0,
    Math.min(1, Math.log(spend / 2000) / Math.log(100)),
  ); // ~0 at ₹2k → 1 at ₹200k
  return Math.round(50 + 50 * roasQuality * spendConfidence);
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "green";
  if (score >= 50) return "amber";
  return "red";
}

/** Tailwind text/bg classes per band (design tokens). */
export const BAND_CLASSES: Record<ScoreBand, string> = {
  green: "text-green bg-green-bg",
  amber: "text-amber bg-amber-bg",
  red: "text-red bg-red-bg",
};
