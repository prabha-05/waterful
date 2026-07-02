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
export async function signPaths(
  paths: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const clean = [...new Set(paths.filter(Boolean))];
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
      if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
    }
    console.log(`[signPaths] signed ${map.size}/${clean.length}`);
  } catch (e) {
    console.log(`[signPaths] threw: ${(e as Error)?.message ?? String(e)}`);
  }
  return map;
}
