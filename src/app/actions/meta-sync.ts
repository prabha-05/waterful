"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { runMetaSync } from "@/lib/meta/sync";

export type ActionResult = { ok: boolean; error?: string; ads?: number };

/** Manual 28-day re-pull for all linked ads — `sync` perm (Admin + Performance). */
export async function triggerSync(): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("sync");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const res = await runMetaSync("manual", "28d", user.id);
  revalidatePath("/meta-sync");
  return res.ok ? { ok: true, ads: res.ads } : { ok: false, error: res.error };
}

/** Full rebuild — re-pull every ad from its start (danger-zone, confirmed in UI). */
export async function triggerRebuild(): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("master");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const res = await runMetaSync("rebuild", "full", user.id);
  revalidatePath("/meta-sync");
  return res.ok ? { ok: true, ads: res.ads } : { ok: false, error: res.error };
}
