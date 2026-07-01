"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  adActivations,
  adDecisionLog,
  adMetrics,
  adRangeMetrics,
  creativeFiles,
  creativePersonas,
  creatives,
} from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { fetchMetaData } from "@/lib/meta";

export type ActionResult = { ok: boolean; error?: string; id?: string };

function revalidateLoop() {
  revalidatePath("/library");
  revalidatePath("/awaiting");
}

/**
 * Create + tag a creative → Draft (README §6). `upload`-gated.
 * Files are uploaded to Supabase Storage from the BROWSER (direct-to-Storage,
 * decisions §9) so large UGC video never routes through the app server; this
 * action only persists the resulting storage paths + metadata (small body).
 */
export async function createCreative(data: {
  title: string;
  typeId: string;
  subtypeId: string;
  angleId: string;
  awarenessId: string | null;
  hookId: string | null;
  reviewLink: string;
  reviewSummary: string;
  personaIds: string[];
  files: { storagePath: string; position: number }[];
}): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("upload");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const title = data.title.trim();
  // All-required validation (mirrors the client gate; never trust the client).
  if (!title || !data.typeId || !data.subtypeId || !data.angleId || !data.reviewLink.trim() || !data.reviewSummary.trim())
    return { ok: false, error: "All fields (title, format, angle, review link + summary) are required." };
  if (data.personaIds.length === 0)
    return { ok: false, error: "Pick at least one persona." };
  if (data.files.length === 0)
    return { ok: false, error: "Add at least one file." };

  // Persona must be mapped to the chosen angle (server-side enforcement, README §6).
  const mapRows = (await db.execute(
    sql`select persona_id from angle_personas where angle_id = ${data.angleId}`,
  )) as unknown as { persona_id: string }[];
  const allowed = new Set(mapRows.map((r) => r.persona_id));
  if (!data.personaIds.every((p) => allowed.has(p)))
    return { ok: false, error: "A selected persona isn't mapped to that angle." };

  const [created] = await db
    .insert(creatives)
    .values({
      title,
      typeId: data.typeId,
      subtypeId: data.subtypeId,
      angleId: data.angleId,
      awarenessId: data.awarenessId,
      hookId: data.hookId,
      reviewLink: data.reviewLink.trim(),
      reviewSummary: data.reviewSummary.trim(),
      status: "draft",
      uploadedBy: user.id,
    })
    .returning({ id: creatives.id });

  await db.insert(creativeFiles).values(
    data.files.map((f) => ({
      creativeId: created.id,
      storagePath: f.storagePath,
      position: f.position,
    })),
  );
  await db.insert(creativePersonas).values(
    data.personaIds.map((personaId) => ({ creativeId: created.id, personaId })),
  );

  revalidateLoop();
  return { ok: true, id: created.id };
}

export async function editTags(
  creativeId: string,
  data: {
    title: string;
    typeId: string;
    subtypeId: string;
    angleId: string;
    awarenessId: string | null;
    hookId: string | null;
    personaIds: string[];
  },
): Promise<ActionResult> {
  try {
    await requirePermission("upload");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!data.title.trim() || data.personaIds.length === 0)
    return { ok: false, error: "Title and at least one persona are required." };

  await db
    .update(creatives)
    .set({
      title: data.title.trim(),
      typeId: data.typeId,
      subtypeId: data.subtypeId,
      angleId: data.angleId,
      awarenessId: data.awarenessId,
      hookId: data.hookId,
    })
    .where(eq(creatives.id, creativeId));

  await db.delete(creativePersonas).where(eq(creativePersonas.creativeId, creativeId));
  await db
    .insert(creativePersonas)
    .values(data.personaIds.map((personaId) => ({ creativeId, personaId })));

  revalidateLoop();
  revalidatePath(`/library`);
  return { ok: true, id: creativeId };
}

export async function setArchived(
  creativeId: string,
  archived: boolean,
): Promise<ActionResult> {
  try {
    await requirePermission("upload");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const [c] = await db
    .select({ status: creatives.status })
    .from(creatives)
    .where(eq(creatives.id, creativeId));
  if (!c) return { ok: false, error: "Creative not found." };

  if (archived) {
    // Archive/Restore only when status ≠ Live (README §4 / decisions G5).
    if (c.status === "live")
      return { ok: false, error: "Can't archive a Live creative — unlink its ads first." };
    await db.update(creatives).set({ status: "archived" }).where(eq(creatives.id, creativeId));
  } else {
    // Restore → live if it has ads, else draft.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(adActivations)
      .where(eq(adActivations.creativeId, creativeId));
    await db
      .update(creatives)
      .set({ status: Number(n) > 0 ? "live" : "draft" })
      .where(eq(creatives.id, creativeId));
  }

  revalidateLoop();
  return { ok: true, id: creativeId };
}

/** Link a Meta Ad ID → on-link lifetime backfill (mock) → Draft becomes Live (§6, §8). */
export async function linkAd(
  creativeId: string,
  metaAdId: string,
): Promise<ActionResult> {
  try {
    await requirePermission("link");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const adId = metaAdId.trim();
  if (!adId) return { ok: false, error: "Enter a Meta Ad ID." };

  // Global uniqueness — friendly "already linked to X" (README §7).
  const [existing] = await db
    .select({ title: creatives.title })
    .from(adActivations)
    .innerJoin(creatives, eq(creatives.id, adActivations.creativeId))
    .where(eq(adActivations.metaAdId, adId));
  if (existing)
    return { ok: false, error: `Ad ID already linked to "${existing.title}".` };

  const [c] = await db
    .select({ id: creatives.id, typeId: creatives.typeId })
    .from(creatives)
    .where(eq(creatives.id, creativeId));
  if (!c) return { ok: false, error: "Creative not found." };

  const [{ isVideo }] = await db.execute(
    sql`select (label = 'Video') as "isVideo" from types where id = ${c.typeId}`,
  ) as unknown as { isVideo: boolean }[];

  // On-link lifetime backfill — pull full history so Lifetime KPIs + Score are correct (§6).
  const pull = await fetchMetaData(adId, { isVideo: Boolean(isVideo) });

  await db.insert(adActivations).values({
    metaAdId: adId,
    creativeId,
    campaignId: pull.activation.campaignId,
    adsetId: pull.activation.adsetId,
    placement: pull.activation.placement,
    status: pull.activation.status,
    lastSyncedAt: new Date(),
  });

  if (pull.daily.length > 0) {
    await db.insert(adMetrics).values(
      pull.daily.map((d) => ({
        adId,
        asOfDate: d.asOfDate,
        spend: String(d.spend),
        revenue: String(d.revenue),
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        reach: d.reach,
        thumbstop: d.thumbstop === null ? null : String(d.thumbstop),
        hold: d.hold === null ? null : String(d.hold),
      })),
    );
  }
  if (pull.ranges.length > 0) {
    await db.insert(adRangeMetrics).values(
      pull.ranges.map((r) => ({
        adId,
        range: r.range,
        reach: r.reach,
        frequency: String(r.frequency),
        asOfDate: new Date().toISOString().slice(0, 10),
      })),
    );
  }

  // First ad linked → creative goes Live (status auto-derives, §7 constraints).
  await db.update(creatives).set({ status: "live" }).where(eq(creatives.id, creativeId));

  revalidateLoop();
  revalidatePath(`/ad/${adId}`);
  return { ok: true, id: adId };
}

export async function unlinkAd(metaAdId: string): Promise<ActionResult> {
  try {
    await requirePermission("unlink");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [aa] = await db
    .select({ creativeId: adActivations.creativeId })
    .from(adActivations)
    .where(eq(adActivations.metaAdId, metaAdId));
  if (!aa) return { ok: false, error: "Ad not found." };

  await db.delete(adActivations).where(eq(adActivations.metaAdId, metaAdId)); // cascades metrics/log

  // Unlinking the last ad reverts the creative to Draft (unless archived).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adActivations)
    .where(eq(adActivations.creativeId, aa.creativeId));
  if (Number(n) === 0) {
    await db
      .update(creatives)
      .set({ status: "draft" })
      .where(and(eq(creatives.id, aa.creativeId), sql`status <> 'archived'`));
  }

  revalidateLoop();
  return { ok: true };
}

export async function addDecisionLog(
  metaAdId: string,
  text: string,
): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("log");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const t = text.trim();
  if (!t) return { ok: false, error: "Write something first." };

  await db.insert(adDecisionLog).values({ adId: metaAdId, authorId: user.id, text: t });
  revalidatePath(`/ad/${metaAdId}`);
  return { ok: true };
}
