import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { timed } from "@/lib/perf";

const BUCKET = "creatives";
const SIGN_TIMEOUT_MS = 6000;

/**
 * Sign private Storage paths into temporary URLs (the bucket is private; decisions §5
 * keeps creative files behind auth). Batched via createSignedUrls. Returns path → URL.
 *
 * Hardened to FAIL-FAST: signing is a network call to Supabase Storage; it must never
 * block page render. If it errors or exceeds the timeout, we return an empty map and
 * the UI falls back to placeholder thumbnails.
 */
// Signed URLs are reused across requests until they're near expiry. Two wins
// (2026-09-25): Library/Awaiting stop paying a Storage round trip for every
// thumbnail on every visit, and the URL for a given file stays the same between
// visits, so the browser serves thumbnails from its own cache instead of
// downloading every image again. Every signed-in user can see every creative
// (decisions §5), so sharing a URL across users exposes nothing new.
const SIGN_TTL_S = 3600;
const REUSE_MARGIN_MS = 10 * 60_000; // re-sign when under 10 min remain
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function signPaths(
  paths: string[],
  expiresIn = SIGN_TTL_S,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;

  const now = Date.now();
  const clean: string[] = [];
  for (const p of unique) {
    const hit = signedCache.get(p);
    if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) map.set(p, hit.url);
    else clean.push(p);
  }
  if (clean.length === 0) return map;

  try {
    const supabase = await createSupabaseServerClient();
    const result = await timed(`signPaths(${clean.length})`, () =>
      Promise.race([
        supabase.storage.from(BUCKET).createSignedUrls(clean, expiresIn),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: "sign-timeout" } }), SIGN_TIMEOUT_MS),
        ),
      ]),
    );
    const anyResult = result as { data: unknown; error?: { message?: string } };
    if (anyResult.error) {
      console.log(`[signPaths] top-level error: ${anyResult.error.message ?? JSON.stringify(anyResult.error)}`);
    }
    for (const item of result.data ?? []) {
      if (item.error) console.log(`[signPaths] item error for ${item.path}: ${JSON.stringify(item.error)}`);
      if (item.path && item.signedUrl) {
        map.set(item.path, item.signedUrl);
        signedCache.set(item.path, { url: item.signedUrl, expiresAt: now + expiresIn * 1000 });
      }
    }
    // Bound the cache; entries are tiny, this just stops unbounded growth.
    if (signedCache.size > 5000) {
      for (const [k, v] of signedCache) if (v.expiresAt - now <= REUSE_MARGIN_MS) signedCache.delete(k);
    }
    console.log(`[signPaths] signed ${map.size}/${clean.length}`);
  } catch (e) {
    console.log(`[signPaths] threw: ${(e as Error)?.message ?? String(e)}`);
  }
  return map;
}
