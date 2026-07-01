import "server-only";
import { sqlClient } from "@/lib/db";

export type LabelRow = { id: string; label: string; archived: boolean; usage: number };
export type SubtypeRow = LabelRow & { typeId: string };
export type TypeRow = LabelRow & { subtypes: SubtypeRow[] };
export type MappingRow = {
  angleId: string;
  angleLabel: string;
  personas: { personaId: string; personaLabel: string; usage: number }[];
};

export type MasterData = {
  personas: LabelRow[];
  angles: LabelRow[];
  types: TypeRow[];
  awareness: LabelRow[];
  hooks: LabelRow[];
  mapping: MappingRow[];
  personaOptions: { id: string; label: string }[];
};

export async function getMasterData(): Promise<MasterData> {
  const personas = (await sqlClient`
    select p.id, p.label, (p.archived_at is not null) as archived,
           (select count(*)::int from creative_personas cp where cp.persona_id = p.id) as usage
    from personas p order by p.label`) as unknown as LabelRow[];

  const angles = (await sqlClient`
    select a.id, a.label, (a.archived_at is not null) as archived,
           (select count(*)::int from creatives c where c.angle_id = a.id) as usage
    from angles a order by a.label`) as unknown as LabelRow[];

  const typeRows = (await sqlClient`
    select t.id, t.label, (t.archived_at is not null) as archived,
           (select count(*)::int from creatives c where c.type_id = t.id) as usage
    from types t order by t.label`) as unknown as LabelRow[];

  const subRows = (await sqlClient`
    select st.id, st.type_id as "typeId", st.label, (st.archived_at is not null) as archived,
           (select count(*)::int from creatives c where c.subtype_id = st.id) as usage
    from subtypes st order by st.label`) as unknown as SubtypeRow[];

  const awareness = (await sqlClient`
    select a.id, a.label, (a.archived_at is not null) as archived,
           (select count(*)::int from creatives c where c.awareness_id = a.id) as usage
    from awareness_stages a order by a.label`) as unknown as LabelRow[];

  const hooks = (await sqlClient`
    select h.id, h.label, (h.archived_at is not null) as archived,
           (select count(*)::int from creatives c where c.hook_id = h.id) as usage
    from hook_types h order by h.label`) as unknown as LabelRow[];

  // Angle↔Persona mapping with per-pair usage (locked when a creative uses that exact pair).
  const mapRows = (await sqlClient`
    select ap.angle_id as "angleId", a.label as "angleLabel",
           ap.persona_id as "personaId", p.label as "personaLabel",
           (select count(*)::int from creatives c
              join creative_personas cp on cp.creative_id = c.id
              where c.angle_id = ap.angle_id and cp.persona_id = ap.persona_id) as usage
    from angle_personas ap
    join angles a on a.id = ap.angle_id
    join personas p on p.id = ap.persona_id
    order by a.label, p.label`) as unknown as {
    angleId: string;
    angleLabel: string;
    personaId: string;
    personaLabel: string;
    usage: number;
  }[];

  const mapping: MappingRow[] = [];
  for (const m of mapRows) {
    let row = mapping.find((x) => x.angleId === m.angleId);
    if (!row) {
      row = { angleId: m.angleId, angleLabel: m.angleLabel, personas: [] };
      mapping.push(row);
    }
    row.personas.push({ personaId: m.personaId, personaLabel: m.personaLabel, usage: m.usage });
  }

  return {
    personas,
    angles,
    types: typeRows.map((t) => ({ ...t, subtypes: subRows.filter((s) => s.typeId === t.id) })),
    awareness,
    hooks,
    mapping,
    personaOptions: personas.filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.label })),
  };
}
