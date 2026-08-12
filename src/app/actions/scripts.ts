"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scriptActivity, scripts } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { nextStage, STAGE_LABEL, type ScriptStage } from "@/lib/script-stage";

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

export async function createScript(input: {
  title: string;
  hookLine?: string;
  body?: string;
  angleId?: string | null;
  personaId?: string | null;
  type?: string | null;
}): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the script a title." };

  const body = input.body ?? "";
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
      personaId: input.personaId || null,
      type: input.type || null,
      writerId: user.id,
      stage: "draft",
    })
    .returning({ id: scripts.id, code: scripts.code });

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
    personaId?: string | null;
    type?: string | null;
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
  if (current.stage === "creators" || current.stage === "received") {
    return { ok: false, error: `Can't edit a script that is ${STAGE_LABEL[current.stage].toLowerCase()}.` };
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
      personaId: input.personaId === undefined ? current.personaId : input.personaId || null,
      type: input.type === undefined ? current.type : input.type || null,
      // A rewrite after rejection is a new version — that is what "v3" means.
      version: bodyChanged && current.stage === "changes" ? current.version + 1 : current.version,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id));

  if (bodyChanged) await log(id, user.id, "Edited the script");
  revalidatePath("/scripts");
  return { ok: true };
}

/** draft|changes → review → approved → creators → received. */
export async function advanceScript(id: string, creatorId?: string): Promise<ScriptResult> {
  let user;
  try {
    user = await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };

  const to = nextStage(current.stage as ScriptStage);
  if (!to) return { ok: false, error: "This script is already at the end of the pipeline." };
  // "With content" means a named person is holding it; without that the stage
  // says nothing useful.
  if (to === "creators" && !creatorId) {
    return { ok: false, error: "Pick the creator who is shooting this." };
  }

  await db
    .update(scripts)
    .set({
      stage: to,
      creatorId: to === "creators" ? creatorId! : current.creatorId,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id));

  await log(
    id,
    user.id,
    `Moved from ${STAGE_LABEL[current.stage as ScriptStage]} to ${STAGE_LABEL[to]}`,
  );
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
      : `Sent back for changes from ${STAGE_LABEL[current.stage as ScriptStage]}`,
  );
  revalidatePath("/scripts");
  return { ok: true };
}

export async function deleteScript(id: string): Promise<ScriptResult> {
  try {
    await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [current] = await db.select().from(scripts).where(eq(scripts.id, id));
  if (!current) return { ok: false, error: "Script not found." };
  // Anything past approval may already have a creative pointing at it.
  if (current.stage !== "draft" && current.stage !== "changes") {
    return { ok: false, error: "Only a draft or a script awaiting changes can be deleted." };
  }
  await db.delete(scripts).where(eq(scripts.id, id));
  revalidatePath("/scripts");
  return { ok: true };
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
