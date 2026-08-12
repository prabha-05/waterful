"use server";

import { requirePermission } from "@/lib/auth/guard";
import { getScript, type ScriptDetail } from "@/lib/data/scripts";

/**
 * Read one script for the drawer. A server action rather than a route handler
 * so the `script` permission is enforced the same way every mutation is —
 * the drawer opens over a client component and has no server parent of its own.
 */
export async function fetchScript(id: string): Promise<ScriptDetail | null> {
  await requirePermission("script");
  return getScript(id);
}
