import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const result = await Promise.race([
      supabase.storage.from(BUCKET).createSignedUrls(clean, expiresIn),
      new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), SIGN_TIMEOUT_MS),
      ),
    ]);
    for (const item of result.data ?? []) {
      if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
    }
  } catch {
    // Network/RLS error — degrade gracefully to placeholders.
  }
  return map;
}
