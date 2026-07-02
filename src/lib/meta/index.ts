import { fetchMetaData as fetchMock } from "./mock";
import type { MetaPull } from "./types";

export type { MetaActivation, MetaDaily, MetaRange, MetaPull } from "./types";

/**
 * Active Meta provider. Uses the real Meta Marketing API when META_ACCESS_TOKEN
 * is set; otherwise the deterministic mock (decisions §10). The real provider
 * (lib/meta/real.ts) implements the same signature, so swapping is env-only.
 */
export async function fetchMetaData(
  adId: string,
  opts: { isVideo: boolean; since?: Date },
): Promise<MetaPull> {
  if (process.env.META_ACCESS_TOKEN) {
    try {
      const { fetchMetaData: fetchReal } = await import("./real");
      return await fetchReal(adId, opts);
    } catch (err) {
      // Token expired/invalid or the ad isn't in this account → don't hard-fail the
      // link/sync; fall back to the deterministic mock so the flow still works.
      // Logged loudly so simulated data is never mistaken for real Meta data.
      console.log(
        `[meta] real provider failed for ad ${adId}: ${(err as Error).message}. ` +
          `Falling back to MOCK (simulated) data.`,
      );
      return fetchMock(adId, opts);
    }
  }
  return fetchMock(adId, opts);
}
