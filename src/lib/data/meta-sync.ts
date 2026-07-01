import "server-only";
import { sqlClient } from "@/lib/db";

export type SyncRunRow = {
  id: string;
  kind: string;
  window: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  adsCount: number;
  triggeredBy: string | null;
};

export type MetaSyncData = {
  adsTracked: number;
  lastSync: { at: string; kind: string } | null;
  runs: SyncRunRow[];
  hasToken: boolean;
};

export async function getMetaSyncData(): Promise<MetaSyncData> {
  const [{ n }] = (await sqlClient`select count(*)::int n from ad_activations`) as unknown as { n: number }[];
  const runs = (await sqlClient`
    select s.id, s.kind, s.window, s.status, s.started_at as "startedAt",
           s.finished_at as "finishedAt", s.ads_count as "adsCount", u.name as "triggeredBy"
    from sync_runs s left join users u on u.id = s.triggered_by
    order by s.started_at desc limit 20`) as unknown as SyncRunRow[];

  const lastDone = runs.find((r) => r.status === "success");
  return {
    adsTracked: Number(n),
    lastSync: lastDone ? { at: lastDone.finishedAt ?? lastDone.startedAt, kind: lastDone.kind } : null,
    runs,
    hasToken: !!process.env.META_ACCESS_TOKEN,
  };
}
