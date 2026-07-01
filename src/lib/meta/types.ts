/**
 * Meta integration types. The real Meta Marketing API provider will implement the
 * same shapes (decisions §10 — Meta is mocked in the prototype, built for real later).
 */
export type MetaAdStatus =
  | "active"
  | "paused"
  | "archived"
  | "pending"
  | "unknown";

export type MetaActivation = {
  campaignId: string;
  adsetId: string;
  placement: string;
  status: MetaAdStatus;
  // Display-only (Ad frame "Campaign & Ad Set" card) — not stored in our schema,
  // re-derived deterministically from the Ad ID for the mock.
  campaignName: string;
  adsetName: string;
  objective: string;
  budgetType: string; // e.g. "CBO" / "Ad set budget"
  dailyBudget: number;
  optimization: string;
};

export type MetaDaily = {
  asOfDate: string; // YYYY-MM-DD
  spend: number;
  revenue: number;
  impressions: number;
  reach: number; // daily unique — stored per day, NEVER summed for lifetime (§6 G1)
  clicks: number;
  conversions: number;
  thumbstop: number | null; // video-only
  hold: number | null; // video-only
};

export type MetaRange = {
  range: "lifetime" | "last_7" | "prior_7";
  reach: number; // de-duplicated, pulled per range (§6 G1)
  frequency: number;
};

export type MetaPull = {
  activation: MetaActivation;
  daily: MetaDaily[];
  ranges: MetaRange[];
  campaignStart: string; // YYYY-MM-DD
};
