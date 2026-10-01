import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { landingPageSpeed } from "@/lib/db/schema";

/**
 * Google PageSpeed Insights (mobile) for the pages our ads land on.
 *
 * Needs PAGESPEED_API_KEY: without a key, Google's shared anonymous quota is
 * exhausted most of the time (429 "Queries per day"). With one it's 25,000
 * checks a day, free. No key → nothing is checked and the UI says so.
 *
 * A check takes 10–40s on Google's side, so the sync runs them one at a time
 * after the Meta pull, and only for pages not checked in the last day.
 */
const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CHECK_TIMEOUT_MS = 90_000;
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
// Bounds how long a sync can spend here: the rest are picked up next run.
const MAX_PER_RUN = 8;

export const pagespeedConfigured = () => Boolean(process.env.PAGESPEED_API_KEY);

/** One page, many utm variants: results are keyed by the URL without its query string. */
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

type SpeedRow = typeof landingPageSpeed.$inferInsert;

export async function checkPage(url: string): Promise<SpeedRow> {
  const key = pageKey(url);
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) return { url: key, error: "PAGESPEED_API_KEY is not set", checkedAt: new Date() };

  const q = new URL(ENDPOINT);
  q.searchParams.set("url", key);
  q.searchParams.set("strategy", "mobile");
  q.searchParams.set("category", "performance");
  q.searchParams.set("key", apiKey);

  try {
    const res = await fetch(q, { cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { url: key, error: String(json.error?.message ?? res.statusText).slice(0, 300), checkedAt: new Date() };
    }
    const audits = json.lighthouseResult?.audits ?? {};
    const num = (id: string) => {
      const v = audits[id]?.numericValue;
      return typeof v === "number" ? Math.round(v) : null;
    };
    const score = json.lighthouseResult?.categories?.performance?.score;
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    const fieldLcp = json.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    return {
      url: key,
      checkedAt: new Date(),
      score: typeof score === "number" ? Math.round(score * 100) : null,
      fcpMs: num("first-contentful-paint"),
      lcpMs: num("largest-contentful-paint"),
      tbtMs: num("total-blocking-time"),
      cls: typeof cls === "number" ? cls.toFixed(3) : null,
      fieldLcpMs: typeof fieldLcp === "number" ? fieldLcp : null,
      error: null,
    };
  } catch (e) {
    return { url: key, error: (e as Error).message.slice(0, 300), checkedAt: new Date() };
  }
}

export async function saveSpeed(row: SpeedRow) {
  await db
    .insert(landingPageSpeed)
    .values(row)
    .onConflictDoUpdate({
      target: landingPageSpeed.url,
      set: {
        checkedAt: sql`excluded.checked_at`,
        score: sql`excluded.score`,
        fcpMs: sql`excluded.fcp_ms`,
        lcpMs: sql`excluded.lcp_ms`,
        tbtMs: sql`excluded.tbt_ms`,
        cls: sql`excluded.cls`,
        fieldLcpMs: sql`excluded.field_lcp_ms`,
        error: sql`excluded.error`,
      },
    });
}

/**
 * Check every landing page in use that hasn't been checked in the last day.
 * Never throws — a speed check must not fail a Meta sync.
 */
export async function refreshLandingSpeeds(): Promise<string> {
  if (!pagespeedConfigured()) return "pagespeed skipped (no PAGESPEED_API_KEY)";
  try {
    const rows = (await db.execute(sql`
      select distinct landing_url as url from ad_activations where landing_url is not null
    `)) as unknown as { url: string }[];
    const pages = [...new Set(rows.map((r) => pageKey(r.url)))];
    const checked = (await db.execute(sql`
      select url, checked_at from landing_page_speed where error is null
    `)) as unknown as { url: string; checked_at: string }[];
    const fresh = new Set(
      checked
        .filter((c) => Date.now() - new Date(c.checked_at).getTime() < RECHECK_AFTER_MS)
        .map((c) => c.url),
    );
    const due = pages.filter((p) => !fresh.has(p)).slice(0, MAX_PER_RUN);
    let ok = 0;
    for (const p of due) {
      const row = await checkPage(p);
      await saveSpeed(row);
      if (!row.error) ok++;
    }
    return `pagespeed: ${ok}/${due.length} checked (${pages.length} pages in use)`;
  } catch (e) {
    return `pagespeed threw: ${(e as Error).message}`;
  }
}
