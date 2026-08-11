/**
 * Verify, with no rounding, the claims made about geographic spend:
 *  1. lifetime total + region count
 *  2. exact non-India spend
 *  3. WHICH campaigns spent it, and WHEN
 *  4. whether any recent (2026) campaign still spends outside India
 *  5. CTR ranking among meaningful-spend states
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const token = process.env.META_ACCESS_TOKEN;
const acct = process.env.META_AD_ACCOUNT_ID;
const V = process.env.META_GRAPH_VERSION || "v21.0";

async function ins(params) {
  const qs = new URLSearchParams({ access_token: token, limit: "500", ...params });
  const res = await fetch(`https://graph.facebook.com/${V}/${acct}/insights?${qs}`);
  const b = await res.json();
  if (b.error) throw new Error(`${b.error.message} (code ${b.error.code})`);
  return b.data ?? [];
}
const money = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- 1 & 2: lifetime by country, exact ----------
const country = await ins({ level: "account", date_preset: "maximum", breakdowns: "country", fields: "spend,impressions" });
const cRows = country.map((r) => ({ c: r.country, spend: Number(r.spend || 0), impr: Number(r.impressions || 0) }));
const cTotal = cRows.reduce((s, r) => s + r.spend, 0);
const india = cRows.find((r) => r.c === "IN");
const nonIndia = cRows.filter((r) => r.c !== "IN");

console.log("=== CLAIM 1: lifetime total ===");
console.log(`account total (country breakdown): Rs ${money(cTotal)}`);
for (const r of cRows.sort((a, b) => b.spend - a.spend)) {
  console.log(`  ${r.c.padEnd(9)} Rs ${money(r.spend).padStart(15)}  ${((r.spend / cTotal) * 100).toFixed(4)}%  ${r.impr.toLocaleString("en-IN")} impr`);
}
console.log(`\nIndia:      Rs ${money(india.spend)}`);
console.log(`NOT India:  Rs ${money(nonIndia.reduce((s, r) => s + r.spend, 0))} (${nonIndia.map((r) => r.c).join(", ")})`);

// ---------- 3: which campaigns, and when ----------
console.log("\n=== CLAIM 2: which campaigns spent outside India ===");
const camp = await ins({
  level: "campaign", date_preset: "maximum", breakdowns: "country",
  fields: "campaign_id,campaign_name,spend,impressions,date_start,date_stop",
});
const foreign = camp.filter((r) => r.country !== "IN" && Number(r.spend) > 0)
  .map((r) => ({ name: r.campaign_name, id: r.campaign_id, c: r.country, spend: Number(r.spend) }))
  .sort((a, b) => b.spend - a.spend);
const fTotal = foreign.reduce((s, r) => s + r.spend, 0);
for (const r of foreign.slice(0, 12)) {
  console.log(`  ${String(r.name).slice(0, 46).padEnd(48)} ${r.c.padEnd(8)} Rs ${money(r.spend).padStart(11)}`);
}
console.log(`  ... ${foreign.length} rows in total`);
console.log(`campaign-level non-India sum: Rs ${money(fTotal)}`);
const top2 = foreign.slice(0, 2).reduce((s, r) => s + r.spend, 0);
console.log(`top 2 campaigns: Rs ${money(top2)} = ${((top2 / fTotal) * 100).toFixed(2)}% of non-India spend`);

// ---------- 4: is it still happening? ----------
console.log("\n=== CLAIM 3: is foreign spend still happening? ===");
for (const [label, range] of [
  ["2026 (1 Jan - today)", { since: "2026-01-01", until: "2026-08-11" }],
  ["2025 full year", { since: "2025-01-01", until: "2025-12-31" }],
  ["2024 full year", { since: "2024-01-01", until: "2024-12-31" }],
  ["2023 (from 1 Aug, API limit)", { since: "2023-08-01", until: "2023-12-31" }],
]) {
  const d = await ins({ level: "account", time_range: JSON.stringify(range), breakdowns: "country", fields: "spend" });
  const t = d.reduce((s, r) => s + Number(r.spend || 0), 0);
  const nf = d.filter((r) => r.country !== "IN").reduce((s, r) => s + Number(r.spend || 0), 0);
  const which = d.filter((r) => r.country !== "IN" && Number(r.spend) > 0).map((r) => `${r.country}:${Math.round(Number(r.spend))}`).join(" ");
  console.log(`  ${label.padEnd(22)} total Rs ${money(t).padStart(14)}   non-India Rs ${money(nf).padStart(10)}  ${which || "(none)"}`);
}

// ---------- 5: CTR ranking among real-spend states ----------
console.log("\n=== CLAIM 4: worst CTR among states with meaningful spend ===");
const reg = await ins({ level: "account", date_preset: "maximum", breakdowns: "region", fields: "spend,impressions,clicks" });
const rRows = reg.map((r) => ({
  region: r.region, spend: Number(r.spend || 0), impr: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
})).filter((r) => r.spend >= 100000).map((r) => ({ ...r, ctr: r.impr ? (r.clicks / r.impr) * 100 : 0 }))
  .sort((a, b) => a.ctr - b.ctr);
console.log(`  (states with >= Rs 1,00,000 lifetime spend: ${rRows.length})`);
for (const r of rRows.slice(0, 6)) {
  console.log(`  WORST  ${r.region.padEnd(22)} CTR ${r.ctr.toFixed(3)}%   spend Rs ${money(r.spend)}`);
}
const total = reg.reduce((s, r) => s + Number(r.spend || 0), 0);
const sorted = reg.map((r) => Number(r.spend || 0)).sort((a, b) => b - a);
console.log(`\n  regions returned: ${reg.length}; with spend>0: ${reg.filter((r) => Number(r.spend) > 0).length}`);
console.log(`  top 10 share: ${((sorted.slice(0, 10).reduce((s, v) => s + v, 0) / total) * 100).toFixed(2)}%`);
