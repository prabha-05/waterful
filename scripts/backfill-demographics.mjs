/**
 * Pull DAILY demographics for every linked ad and upsert them. Standalone so a
 * backfill can run without the app (the sync path does the same thing, but this
 * can target either database and reports progress per ad).
 *
 *   node scripts/backfill-demographics.mjs [sinceISO]
 *   DATABASE_URL=<prod> node scripts/backfill-demographics.mjs 2026-05-01
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const TOKEN = process.env.META_ACCESS_TOKEN;
const V = process.env.META_GRAPH_VERSION || "v21.0";
const SINCE = process.argv[2] ?? null;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const ymd = (d) => d.toISOString().slice(0, 10);
const window = SINCE ? { time_range: JSON.stringify({ since: SINCE, until: ymd(new Date()) }) } : { date_preset: "maximum" };

async function graphAll(path, params) {
  const url = new URL(`https://graph.facebook.com/${V}/${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const out = [];
  let next = url.toString();
  while (next) {
    const res = await fetch(next, { cache: "no-store" });
    const json = await res.json();
    if (json.error) throw new Error(`${json.error.message} (code ${json.error.code})`);
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }
  return out;
}

const purchase = (arr) => {
  if (!arr) return 0;
  for (const t of ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};

const ads = await sql`select meta_ad_id from ad_activations order by meta_ad_id`;
console.log(`${ads.length} linked ads; window = ${SINCE ?? "lifetime"}\n`);

let done = 0, rowsWritten = 0, failed = 0;
for (const { meta_ad_id: adId } of ads) {
  const acc = new Map();
  const bump = (date, dimension, segment, r, withRevenue) => {
    const key = `${date}|${dimension}|${segment}`;
    const cur = acc.get(key) ?? {
      ad_id: adId, as_of_date: date, dimension, segment,
      spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0,
      window: SINCE ? "28d" : "full",
    };
    cur.spend += Number(r.spend) || 0;
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    cur.reach += Number(r.reach) || 0;
    if (withRevenue) {
      cur.revenue += purchase(r.action_values);
      cur.conversions += purchase(r.actions);
    }
    acc.set(key, cur);
  };

  try {
    const ag = await graphAll(`${adId}/insights`, {
      fields: "spend,impressions,reach,clicks,actions,action_values",
      breakdowns: "age,gender", time_increment: "1", limit: "500", ...window,
    });
    for (const r of ag) {
      const d = r.date_start, age = String(r.age ?? "unknown"), gender = String(r.gender ?? "unknown");
      bump(d, "age", age, r, true);
      bump(d, "gender", gender, r, true);
      bump(d, "age_gender", `${age} ${gender}`, r, true);
    }
  } catch (e) {
    console.log(`  ! age/gender ${adId}: ${e.message}`);
    failed++;
  }

  try {
    const reg = await graphAll(`${adId}/insights`, {
      fields: "spend,impressions,reach,clicks",
      breakdowns: "region", time_increment: "1", limit: "500", ...window,
    });
    for (const r of reg) bump(r.date_start, "region", String(r.region ?? "unknown"), r, false);
  } catch (e) {
    console.log(`  ! region ${adId}: ${e.message}`);
  }

  const rows = [...acc.values()].map((r) => ({
    ...r, spend: String(r.spend), revenue: String(r.revenue), synced_at: new Date(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sql`
      insert into ad_demographic_metrics ${sql(rows.slice(i, i + 500))}
      on conflict (ad_id, as_of_date, dimension, segment) do update set
        spend = excluded.spend, revenue = excluded.revenue,
        impressions = excluded.impressions, clicks = excluded.clicks,
        conversions = excluded.conversions, reach = excluded.reach,
        "window" = excluded."window", synced_at = now()`;
  }
  rowsWritten += rows.length;
  done++;
  process.stdout.write(`\r${done}/${ads.length} ads — ${rowsWritten} rows`);
}

const [t] = await sql`
  select count(*)::int rows, count(distinct ad_id)::int ads,
         min(as_of_date)::text lo, max(as_of_date)::text hi
  from ad_demographic_metrics`;
console.log(`\n\ntotal: ${t.rows} rows across ${t.ads} ads, ${t.lo} -> ${t.hi}` + (failed ? `  (${failed} age/gender failures)` : ""));
await sql.end();
