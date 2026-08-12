import "server-only";
import { sqlClient } from "@/lib/db";

/**
 * Script Library reads. Scripts are the stage BEFORE a creative exists: a writer
 * drafts one, it moves through review to approved, goes out to a creator, and
 * returns as an uploaded creative (which sets `creatives.script_id`).
 */

// Stage vocabulary lives in lib/script-stage.ts so client components can use it.
export {
  STAGE,
  STAGE_LABEL,
  STAGE_TILES,
  STAGE_TONE,
  isEditable,
  nextStage,
  type ScriptStage,
} from "@/lib/script-stage";
import type { ScriptStage } from "@/lib/script-stage";

export type ScriptRow = {
  id: string;
  code: string;
  title: string;
  hookLine: string;
  stage: ScriptStage;
  angle: string | null;
  personas: string[];
  /** "Video · UGC" — how the format reads on a card. */
  format: string | null;
  hook: string | null;
  runtime: number | null;
  words: number;
  version: number;
  writer: string;
  creator: string | null;
  updatedAt: string;
};

export type ScriptDetail = ScriptRow & {
  body: string;
  noteTitle: string | null;
  noteTone: string | null;
  angleId: string | null;
  typeId: string | null;
  subtypeId: string | null;
  awarenessId: string | null;
  hookId: string | null;
  personaIds: string[];
  writerId: string;
  creatorId: string | null;
  createdAt: string;
  activity: { text: string; actor: string; at: string }[];
  /** Set once a creative has been uploaded against this script. */
  creative: { id: string; title: string } | null;
};

export type ScriptLibrary = {
  scripts: ScriptRow[];
  counts: Record<ScriptStage | "all", number>;
  angles: { id: string; label: string }[];
  writers: { id: string; name: string }[];
};

const toRow = (r: Record<string, unknown>): ScriptRow => ({
  id: String(r.id),
  code: String(r.code),
  title: String(r.title),
  hookLine: String(r.hook_line ?? ""),
  stage: r.stage as ScriptStage,
  angle: (r.angle as string | null) ?? null,
  personas: r.personas ? String(r.personas).split("||").filter(Boolean) : [],
  format: [r.type_label, r.subtype_label].filter(Boolean).join(" · ") || null,
  hook: (r.hook_label as string | null) ?? null,
  runtime: r.runtime === null || r.runtime === undefined ? null : Number(r.runtime),
  words: Number(r.words ?? 0),
  version: Number(r.version ?? 1),
  writer: String(r.writer ?? "—"),
  creator: (r.creator as string | null) ?? null,
  updatedAt: String(r.updated_at),
});

export async function getScriptLibrary(): Promise<ScriptLibrary> {
  const [rows, countRows, angleRows, writerRows] = await Promise.all([
    sqlClient`
      select s.id, s.code, s.title, s.hook_line, s.stage, s.runtime,
             s.words, s.version, s.updated_at,
             a.label as angle, t.label as type_label, st.label as subtype_label,
             h.label as hook_label,
             coalesce(string_agg(distinct p.label, '||'), '') as personas,
             w.name as writer, c.name as creator
      from scripts s
      join users w on w.id = s.writer_id
      left join users c on c.id = s.creator_id
      left join angles a on a.id = s.angle_id
      left join types t on t.id = s.type_id
      left join subtypes st on st.id = s.subtype_id
      left join hook_types h on h.id = s.hook_id
      left join script_personas sp on sp.script_id = s.id
      left join personas p on p.id = sp.persona_id
      group by s.id, a.label, t.label, st.label, h.label, w.name, c.name
      order by s.updated_at desc`,
    sqlClient`select stage, count(*)::int as n from scripts group by stage`,
    sqlClient`select id, label from angles where archived_at is null order by label`,
    // Anyone who has actually written a script — not every user in the system.
    sqlClient`
      select distinct u.id, u.name
      from scripts s join users u on u.id = s.writer_id
      order by u.name`,
  ]);

  const counts = {
    all: 0,
    draft: 0,
    review: 0,
    changes: 0,
    approved: 0,
    creators: 0,
    received: 0,
  } as Record<ScriptStage | "all", number>;
  for (const c of countRows) {
    counts[c.stage as ScriptStage] = Number(c.n);
    counts.all += Number(c.n);
  }

  return {
    scripts: rows.map((r) => toRow(r as Record<string, unknown>)),
    counts,
    angles: angleRows.map((a) => ({ id: String(a.id), label: String(a.label) })),
    writers: writerRows.map((w) => ({ id: String(w.id), name: String(w.name) })),
  };
}

export async function getScript(id: string): Promise<ScriptDetail | null> {
  const [s] = await sqlClient`
    select s.*, a.label as angle, t.label as type_label, st.label as subtype_label,
           h.label as hook_label,
           coalesce((select string_agg(p.label, '||' order by p.label)
                     from script_personas sp join personas p on p.id = sp.persona_id
                     where sp.script_id = s.id), '') as personas,
           w.name as writer, c.name as creator
    from scripts s
    join users w on w.id = s.writer_id
    left join users c on c.id = s.creator_id
    left join angles a on a.id = s.angle_id
    left join types t on t.id = s.type_id
    left join subtypes st on st.id = s.subtype_id
    left join hook_types h on h.id = s.hook_id
    where s.id = ${id}`;
  if (!s) return null;

  const [personaIdRows, activity, creative] = await Promise.all([
    sqlClient`select persona_id from script_personas where script_id = ${id}`,
    sqlClient`
      select sa.text, sa.at, u.name as actor
      from script_activity sa join users u on u.id = sa.actor_id
      where sa.script_id = ${id} order by sa.at desc`,
    sqlClient`select id, title from creatives where script_id = ${id} limit 1`,
  ]);

  return {
    ...toRow(s as Record<string, unknown>),
    body: String(s.body ?? ""),
    noteTitle: s.note_title,
    noteTone: s.note_tone,
    angleId: s.angle_id,
    typeId: s.type_id,
    subtypeId: s.subtype_id,
    awarenessId: s.awareness_id,
    hookId: s.hook_id,
    personaIds: personaIdRows.map((r) => String(r.persona_id)),
    writerId: String(s.writer_id),
    creatorId: s.creator_id,
    createdAt: String(s.created_at),
    activity: activity.map((a) => ({
      text: String(a.text),
      actor: String(a.actor),
      at: String(a.at),
    })),
    creative: creative[0] ? { id: String(creative[0].id), title: String(creative[0].title) } : null,
  };
}

/** Approved scripts with no creative yet — the Creative Library's waiting queue. */
export async function getApprovedScripts(): Promise<ScriptRow[]> {
  const rows = await sqlClient`
    select s.id, s.code, s.title, s.hook_line, s.stage, s.runtime,
           s.words, s.version, s.updated_at,
           a.label as angle, t.label as type_label, st.label as subtype_label,
           h.label as hook_label,
           coalesce(string_agg(distinct p.label, '||'), '') as personas,
           w.name as writer, c.name as creator
    from scripts s
    join users w on w.id = s.writer_id
    left join users c on c.id = s.creator_id
    left join angles a on a.id = s.angle_id
    left join types t on t.id = s.type_id
    left join subtypes st on st.id = s.subtype_id
    left join hook_types h on h.id = s.hook_id
    left join script_personas sp on sp.script_id = s.id
    left join personas p on p.id = sp.persona_id
    where s.stage in ('approved','creators')
      and not exists (select 1 from creatives cr where cr.script_id = s.id)
    group by s.id, a.label, t.label, st.label, h.label, w.name, c.name
    order by s.updated_at desc`;
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

/** Badge count in the sidebar — scripts sitting in review, waiting on someone. */
export async function getScriptsInReviewCount(): Promise<number> {
  const [r] = await sqlClient`select count(*)::int as n from scripts where stage = 'review'`;
  return Number(r?.n ?? 0);
}
