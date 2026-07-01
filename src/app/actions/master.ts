"use server";

import { revalidatePath } from "next/cache";
import { sqlClient } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";

export type ActionResult = { ok: boolean; error?: string };

export type TaxKind = "persona" | "angle" | "awareness" | "hook" | "type" | "subtype";
const TABLE: Record<TaxKind, string> = {
  persona: "personas",
  angle: "angles",
  awareness: "awareness_stages",
  hook: "hook_types",
  type: "types",
  subtype: "subtypes",
};

async function guard(): Promise<ActionResult | null> {
  try {
    await requirePermission("master");
    return null;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function ok(): ActionResult {
  revalidatePath("/master-data");
  return { ok: true };
}

/** Usage count — drives delete-when-unused (else archive). */
async function usageOf(kind: TaxKind, id: string): Promise<number> {
  const q = {
    persona: sqlClient`select count(*)::int n from creative_personas where persona_id = ${id}`,
    angle: sqlClient`select count(*)::int n from creatives where angle_id = ${id}`,
    awareness: sqlClient`select count(*)::int n from creatives where awareness_id = ${id}`,
    hook: sqlClient`select count(*)::int n from creatives where hook_id = ${id}`,
    type: sqlClient`select count(*)::int n from creatives where type_id = ${id}`,
    subtype: sqlClient`select count(*)::int n from creatives where subtype_id = ${id}`,
  }[kind];
  const [r] = await q;
  return Number(r.n);
}

export async function createTaxonomy(kind: Exclude<TaxKind, "subtype">, label: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  const l = label.trim();
  if (!l) return { ok: false, error: "Enter a name." };
  await sqlClient`insert into ${sqlClient(TABLE[kind])} (label) values (${l})`;
  // Every type auto-gets an "Other / Untyped" sub-type (decisions §7).
  if (kind === "type") {
    const [t] = await sqlClient`select id from types where label = ${l} order by id desc limit 1`;
    if (t) await sqlClient`insert into subtypes (type_id, label) values (${t.id}, 'Other / Untyped')`;
  }
  return ok();
}

export async function createSubtype(typeId: string, label: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  const l = label.trim();
  if (!l || !typeId) return { ok: false, error: "Pick a type and enter a name." };
  await sqlClient`insert into subtypes (type_id, label) values (${typeId}, ${l})`;
  return ok();
}

export async function renameTaxonomy(kind: TaxKind, id: string, label: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  const l = label.trim();
  if (!l) return { ok: false, error: "Name can't be empty." };
  await sqlClient`update ${sqlClient(TABLE[kind])} set label = ${l} where id = ${id}`;
  return ok();
}

export async function setArchivedTaxonomy(kind: TaxKind, id: string, archived: boolean): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  if (archived) await sqlClient`update ${sqlClient(TABLE[kind])} set archived_at = now() where id = ${id}`;
  else await sqlClient`update ${sqlClient(TABLE[kind])} set archived_at = null where id = ${id}`;
  return ok();
}

export async function deleteTaxonomy(kind: TaxKind, id: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  if ((await usageOf(kind, id)) > 0)
    return { ok: false, error: "In use on creatives — archive it instead." };
  await sqlClient`delete from ${sqlClient(TABLE[kind])} where id = ${id}`;
  return ok();
}

export async function addMapping(angleId: string, personaId: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  if (!angleId || !personaId) return { ok: false, error: "Pick a persona." };
  await sqlClient`insert into angle_personas (angle_id, persona_id) values (${angleId}, ${personaId}) on conflict do nothing`;
  return ok();
}

export async function removeMapping(angleId: string, personaId: string): Promise<ActionResult> {
  const g = await guard();
  if (g) return g;
  // Locked when a creative uses that exact angle+persona pair (can't orphan, README §10).
  const [r] = await sqlClient`
    select count(*)::int n from creatives c
    join creative_personas cp on cp.creative_id = c.id
    where c.angle_id = ${angleId} and cp.persona_id = ${personaId}`;
  if (Number(r.n) > 0)
    return { ok: false, error: "Locked — a creative uses this exact angle + persona pair." };
  await sqlClient`delete from angle_personas where angle_id = ${angleId} and persona_id = ${personaId}`;
  return ok();
}
