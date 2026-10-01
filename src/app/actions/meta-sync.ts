"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { runMetaSync } from "@/lib/meta/sync";
import { checkPage, pagespeedConfigured, saveSpeed } from "@/lib/pagespeed";

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

/**
 * Re-run PageSpeed for one landing page now, rather than waiting for the
 * nightly sync — e.g. right after the store team ships a speed fix. `sync`
 * perm, same people who can pull Meta data. Takes 10–40s on Google's side.
 */
export async function recheckLandingSpeed(url: string): Promise<ActionResult> {
  try {
    await requirePermission("sync");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!pagespeedConfigured()) {
    return { ok: false, error: "PageSpeed isn't set up yet — add PAGESPEED_API_KEY on Render." };
  }
  const row = await checkPage(url);
  await saveSpeed(row);
  revalidatePath("/ad/[adId]", "page");
  revalidatePath("/reports");
  return row.error ? { ok: false, error: row.error } : { ok: true };
}
