import { fetchMetaData as fetchMock } from "./mock";
import type { MetaPull } from "./types";

export type { MetaActivation, MetaDaily, MetaRange, MetaPull } from "./types";

/**
 * Active Meta provider.
 *
 * NEVER silently substitutes simulated data: an ad that fails to pull must fail
 * loudly, because fabricated spend/ROAS in the Library is worse than no ad at
 * all (2026-08: five ads were linked against a broken token and showed ~₹11L of
 * invented spend at 2–3× ROAS for weeks).
 *
 * The deterministic mock (decisions §10) is opt-in for local development only,
 * via META_USE_MOCK=1 — it is never reachable by accident in production.
 */
const USE_MOCK = process.env.META_USE_MOCK === "1";

export async function fetchMetaData(
  adId: string,
  opts: { isVideo: boolean; since?: Date },
): Promise<MetaPull> {
  if (USE_MOCK) return fetchMock(adId, opts);

  if (!process.env.META_ACCESS_TOKEN) {
    throw new Error(
      "META_ACCESS_TOKEN is not set — cannot pull real Meta data. " +
        "Set the token (or META_USE_MOCK=1 for local development with simulated data).",
    );
  }

  const { fetchMetaData: fetchReal } = await import("./real");
  return fetchReal(adId, opts); // errors propagate — the caller surfaces them
}
