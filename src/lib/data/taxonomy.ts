import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { timed } from "@/lib/perf";
import {
  angles,
  anglePersonas,
  awarenessStages,
  hookTypes,
  personas,
  subtypes,
  types,
} from "@/lib/db/schema";

export type Option = { id: string; label: string };
export type TypeWithSubs = Option & { subtypes: Option[] };
export type Taxonomy = Awaited<ReturnType<typeof loadTaxonomy>>;

// Taxonomy changes only via Master Data. Cache it in memory (Render runs a
// persistent Node process) so it isn't 7 DB round-trips on every page — big latency
// win. Master Data actions call clearTaxonomyCache() so edits appear immediately.
let taxonomyCache: { data: Taxonomy; at: number } | null = null;
const TAXONOMY_TTL_MS = 60_000;

export function clearTaxonomyCache() {
  taxonomyCache = null;
}

/** Full active taxonomy for the Upload/Edit forms and Library filters (cached). */
export async function getTaxonomy(): Promise<Taxonomy> {
  const now = Date.now();
  if (taxonomyCache && now - taxonomyCache.at < TAXONOMY_TTL_MS) {
    return taxonomyCache.data;
  }
  const data = await timed("taxonomy.load", loadTaxonomy);
  taxonomyCache = { data, at: now };
  return data;
}

async function loadTaxonomy() {
  const [angleRows, personaRows, typeRows, subtypeRows, awarenessRows, hookRows, mapRows] =
    await Promise.all([
      db.select().from(angles).where(isNull(angles.archivedAt)).orderBy(asc(angles.label)),
      db.select().from(personas).where(isNull(personas.archivedAt)).orderBy(asc(personas.label)),
      db.select().from(types).where(isNull(types.archivedAt)).orderBy(asc(types.label)),
      db.select().from(subtypes).where(isNull(subtypes.archivedAt)).orderBy(asc(subtypes.label)),
      db.select().from(awarenessStages).where(isNull(awarenessStages.archivedAt)),
      db.select().from(hookTypes).where(isNull(hookTypes.archivedAt)),
      db.select().from(anglePersonas),
    ]);

  const typesWithSubs: TypeWithSubs[] = typeRows.map((t) => ({
    id: t.id,
    label: t.label,
    subtypes: subtypeRows
      .filter((s) => s.typeId === t.id)
      .map((s) => ({ id: s.id, label: s.label })),
  }));

  // angleId -> [personaId] (drives the Upload persona dropdown, README §6).
  const anglePersonaMap: Record<string, string[]> = {};
  for (const m of mapRows) {
    (anglePersonaMap[m.angleId] ??= []).push(m.personaId);
  }

  return {
    angles: angleRows.map((a) => ({ id: a.id, label: a.label })),
    personas: personaRows.map((p) => ({ id: p.id, label: p.label })),
    types: typesWithSubs,
    awareness: awarenessRows.map((a) => ({ id: a.id, label: a.label })),
    hooks: hookRows.map((h) => ({ id: h.id, label: h.label })),
    anglePersonaMap,
  };
}

/** Personas mapped to a given angle (server-side guard for Upload validation). */
export async function personasForAngle(angleId: string): Promise<Option[]> {
  const rows = await db
    .select({ id: personas.id, label: personas.label })
    .from(anglePersonas)
    .innerJoin(personas, eq(personas.id, anglePersonas.personaId))
    .where(eq(anglePersonas.angleId, angleId));
  return rows;
}
