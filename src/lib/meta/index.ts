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
    const { fetchMetaData: fetchReal } = await import("./real");
    return fetchReal(adId, opts);
  }
  return fetchMock(adId, opts);
}
