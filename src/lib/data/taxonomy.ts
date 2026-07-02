import { eq } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db";
import { timed } from "@/lib/perf";
import { anglePersonas, personas } from "@/lib/db/schema";

export type Option = { id: string; label: string };
export type TypeWithSubs = Option & { subtypes: Option[] };
export type Taxonomy = Awaited<ReturnType<typeof loadTaxonomy>>;

// Taxonomy changes only via Master Data. Cache it in memory (Render runs a
// persistent Node process) so it isn't a DB round-trip on every page. Master Data
// actions call clearTaxonomyCache() so edits appear immediately; otherwise it
// refreshes at most every TTL. Long TTL because it changes very rarely.
let taxonomyCache: { data: Taxonomy; at: number } | null = null;
const TAXONOMY_TTL_MS = 10 * 60_000; // 10 minutes

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

type Row = { id: string; label: string };
type SubRow = Row & { typeId: string };
type MapRow = { angleId: string; personaId: string };

// One round-trip: each reference list comes back as a JSON array. This replaces 7
// parallel queries that fought over the small connection pool (and could stall for
// seconds when the pooler was saturated). postgres-js parses json columns for us.
async function loadTaxonomy() {
  const [row] = await sqlClient`
    select
      (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by label), '[]'::json)
         from angles where archived_at is null) as angles,
      (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by label), '[]'::json)
         from personas where archived_at is null) as personas,
      (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by label), '[]'::json)
         from types where archived_at is null) as types,
      (select coalesce(json_agg(json_build_object('id', id, 'label', label, 'typeId', type_id) order by label), '[]'::json)
         from subtypes where archived_at is null) as subtypes,
      (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by label), '[]'::json)
         from awareness_stages where archived_at is null) as awareness,
      (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by label), '[]'::json)
         from hook_types where archived_at is null) as hooks,
      (select coalesce(json_agg(json_build_object('angleId', angle_id, 'personaId', persona_id)), '[]'::json)
         from angle_personas) as angle_personas
  `;

  const angleRows = (row.angles ?? []) as Row[];
  const personaRows = (row.personas ?? []) as Row[];
  const typeRows = (row.types ?? []) as Row[];
  const subtypeRows = (row.subtypes ?? []) as SubRow[];
  const awarenessRows = (row.awareness ?? []) as Row[];
  const hookRows = (row.hooks ?? []) as Row[];
  const mapRows = (row.angle_personas ?? []) as MapRow[];

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
