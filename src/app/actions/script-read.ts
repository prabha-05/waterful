"use server";

import { requirePermission } from "@/lib/auth/guard";
import { getScript, type ScriptDetail } from "@/lib/data/scripts";

export type FetchScriptResult =
  | { ok: true; script: ScriptDetail | null }
  | { ok: false; error: string };

/**
 * Read one script for the drawer. A server action rather than a route handler
 * so the `script` permission is enforced the same way every mutation is — the
 * drawer opens over a client component and has no server parent of its own.
 *
 * Returns a result instead of throwing. `requirePermission` throws, and an
 * unhandled rejection in the caller left the drawer showing "Loading…"
 * permanently, with nothing on screen to say what went wrong.
 */
export async function fetchScript(id: string): Promise<FetchScriptResult> {
  try {
    await requirePermission("script");
    return { ok: true, script: await getScript(id) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Couldn't load that script." };
  }
}
