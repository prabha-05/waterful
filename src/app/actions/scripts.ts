"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scriptActivity, scriptPersonas, scripts } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { STAGE, isEditable, type ScriptStage } from "@/lib/script-stage";

export type ScriptResult = { ok: boolean; error?: string; id?: string };

/** Rough spoken-word runtime — ~150 wpm reads about right for ad scripts. */
const WORDS_PER_MINUTE = 150;
const countWords = (body: string) => body.trim().split(/\s+/).filter(Boolean).length;
const runtimeOf = (words: number) => Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60));

async function log(scriptId: string, actorId: string, text: string) {
  await db.insert(scriptActivity).values({ scriptId, actorId, text });
}

/** SCR-0001, SCR-0002 … human-quotable in a WhatsApp message. */
async function nextCode(): Promise<string> {
  const [row] = await db
    .select({ code: scripts.code })
    .from(scripts)
    .orderBy(desc(scripts.code))
    .limit(1);
  const n = row?.code ? Number(row.code.replace(/\D/g, "")) + 1 : 1;
  return `SCR-${String(n).padStart(4, "0")}`;
}

/** New scripts open on a timecoded skeleton rather than an empty box. */
const STARTER_BODY = ["0:00  HOOK — ", "", "0:06  PROBLEM", "", "0:30  CTA", ""].join("\n");

export async function createScript(input: {
  title: string;
  hookLine?: string;
  body?: string;
  angleId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  awarenessId?: string | null;
  hookId?: string | null;
  personaIds?: string[];
}): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the script a title." };

  const body = input.body ?? STARTER_BODY;
  const words = countWords(body);

  const [row] = await db
    .insert(scripts)
    .values({
      code: await nextCode(),
      title,
      hookLine: input.hookLine?.trim() ?? "",
      body,
      words,
      runtime: words > 0 ? runtimeOf(words) : null,
      angleId: input.angleId || null,
      typeId: input.typeId || null,
      subtypeId: input.subtypeId || null,
      awarenessId: input.awarenessId || null,
      hookId: input.hookId || null,
      writerId: user.id,
      stage: "draft",
    })
    .returning({ id: scripts.id, code: scripts.code });

  if (input.personaIds?.length) {
    await db
      .insert(scriptPersonas)
      .values(input.personaIds.map((personaId) => ({ scriptId: row.id, personaId })));
  }

  await log(row.id, user.id, `Created ${row.code} as a draft`);
  revalidatePath("/scripts");
  return { ok: true, id: row.id };
}

export async function updateScript(
  id: string,
  input: {
    title?: string;
    hookLine?: string;
    body?: string;
    noteTitle?: string | null;
    noteTone?: string | null;
    angleId?: string | null;
    typeId?: string | null;
    subtypeId?: string | null;
    awarenessId?: string | null;
    hookId?: string | null;
    personaIds?: string[];
    creatorId?: string | null;
  },
): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };
  // Once it is out with a creator the wording is fixed — otherwise someone
  // shoots one version while the library shows another.
  if (!isEditable(current.stage as ScriptStage)) {
    return {
      ok: false,
      error: `Can't edit a script that is ${STAGE[current.stage as ScriptStage].label.toLowerCase()}.`,
    };
  }

  const body = input.body ?? current.body;
  const words = countWords(body);
  const bodyChanged = input.body !== undefined && input.body !== current.body;

  await db
    .update(scripts)
    .set({
      title: input.title?.trim() || current.title,
      hookLine: input.hookLine ?? current.hookLine,
      body,
      words,
      runtime: words > 0 ? runtimeOf(words) : null,
      noteTitle: input.noteTitle === undefined ? current.noteTitle : input.noteTitle,
      noteTone: input.noteTone === undefined ? current.noteTone : input.noteTone,
      angleId: input.angleId === undefined ? current.angleId : input.angleId || null,
      typeId: input.typeId === undefined ? current.typeId : input.typeId || null,
      subtypeId: input.subtypeId === undefined ? current.subtypeId : input.subtypeId || null,
      awarenessId:
        input.awarenessId === undefined ? current.awarenessId : input.awarenessId || null,
      hookId: input.hookId === undefined ? current.hookId : input.hookId || null,
      creatorId: input.creatorId === undefined ? current.creatorId : input.creatorId || null,
      // A rewrite after rejection is a new version — that is what "v3" means.
      version: bodyChanged && current.stage === "changes" ? current.version + 1 : current.version,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id));

  // Personas are replaced wholesale, same as the creative editor does.
  if (input.personaIds) {
    await db.delete(scriptPersonas).where(eq(scriptPersonas.scriptId, id));
    if (input.personaIds.length) {
      await db
        .insert(scriptPersonas)
        .values(input.personaIds.map((personaId) => ({ scriptId: id, personaId })));
    }
  }

  if (bodyChanged) await log(id, user.id, "Edited the script");
  revalidatePath("/scripts");
  return { ok: true };
}

/** draft|changes → review → approved → creators → received. */
export async function advanceScript(id: string, creatorId?: string): Promise<ScriptResult> {
  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };

  const from = current.stage as ScriptStage;
  const def = STAGE[from];
  const to = def.next;
  if (!to || !def.gate) {
    return { ok: false, error: "This script is already at the end of the pipeline." };
  }

  // The gate is per-stage. Approving needs `master` — a writer submits their
  // script, someone else approves it.
  let user;
  try {
    user = await requirePermission(def.gate);
  } catch {
    return {
      ok: false,
      error:
        def.gate === "master"
          ? "Only someone who can manage master data may approve a script."
          : `Not authorized — missing "${def.gate}" permission.`,
    };
  }
  // The content person is chosen before review, not after approval: the
  // approver should see who it is for, and an approved script is then
  // immediately actionable without a second decision.
  const creator = creatorId || current.creatorId;
  if (def.needsCreator && !creator) {
    return { ok: false, error: "Choose the content person who will shoot this first." };
  }

  await db
    .update(scripts)
    .set({
      stage: to,
      creatorId: creator ?? null,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id));

  await log(id, user.id, `${def.action} — moved to ${STAGE[to].label}`);
  revalidatePath("/scripts");
  revalidatePath("/library");
  return { ok: true };
}

/** Send it back for a rewrite. Always lands on Changes, from wherever it was. */
export async function rejectScript(id: string, reason?: string): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };
  if (current.stage === "changes") return { ok: false, error: "Already awaiting changes." };

  await db
    .update(scripts)
    .set({ stage: "changes", updatedAt: new Date() })
    .where(eq(scripts.id, id));

  const note = reason?.trim();
  await log(
    id,
    user.id,
    note
      ? `Sent back for changes — ${note}`
      : `Requested changes from ${STAGE[current.stage as ScriptStage].label}`,
  );
  revalidatePath("/scripts");
  return { ok: true };
}

/**
 * Remove a script that shouldn't exist.
 *
 * A writer may delete their own early work — a draft, or something sent back
 * for changes. Past that point a script has been approved and possibly shot, so
 * deleting it throws away the record of who approved what: that needs `master`,
 * the same permission that approves in the first place.
 *
 * A creative uploaded against a deleted script is NOT deleted — the FK is
 * ON DELETE SET NULL, so it survives with the link cleared.
 */
export async function deleteScript(id: string): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };

  const early = current.stage === "draft" || current.stage === "changes";
  if (!early && !user.permissions.master) {
    return {
      ok: false,
      error:
        "This script has already been approved — only someone who can approve scripts may delete it.",
    };
  }
  await db.delete(scripts).where(eq(scripts.id, id));
  revalidatePath("/scripts");
  return { ok: true };
}

/**
 * The tagging a creative inherits when it is uploaded against a script —
 * "the creative inherits all of it". Returns null when the script carries no
 * usable classification, in which case the upload form stands on its own.
 */
export async function getScriptTagging(scriptId: string): Promise<{
  angleId: string | null;
  typeId: string | null;
  subtypeId: string | null;
  awarenessId: string | null;
  hookId: string | null;
  personaIds: string[];
  title: string;
} | null> {
  const [s] = await db.select().from(scripts).where(eq(scripts.id, scriptId));
  if (!s) return null;
  const rows = await db
    .select({ personaId: scriptPersonas.personaId })
    .from(scriptPersonas)
    .where(eq(scriptPersonas.scriptId, scriptId));
  return {
    angleId: s.angleId,
    typeId: s.typeId,
    subtypeId: s.subtypeId,
    awarenessId: s.awarenessId,
    hookId: s.hookId,
    personaIds: rows.map((r) => r.personaId),
    title: s.title,
  };
}

/**
 * The seam: a creative was uploaded against this script. Marks the script
 * received and stamps the trail. Called from the upload flow, not the UI.
 */
export async function markScriptReceived(
  scriptId: string,
  actorId: string,
  creativeTitle: string,
): Promise<void> {
  await db
    .update(scripts)
    .set({ stage: "received", updatedAt: new Date() })
    .where(eq(scripts.id, scriptId));
  await db.insert(scriptActivity).values({
    scriptId,
    actorId,
    text: `Creative received — "${creativeTitle}" uploaded`,
  });
}
