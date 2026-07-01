/** Public Supabase env (safe for the browser). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Supabase migrated "anon key" → "publishable key" (sb_publishable_…). Accept
// either name so the value copied from the dashboard works as-is.
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surfaced early in dev/build if env isn't wired yet (see .env.example).
  console.warn(
    "[waterful] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set. " +
      "Copy .env.example to .env.local and fill from your Supabase project (Connect → Framework).",
  );
}
