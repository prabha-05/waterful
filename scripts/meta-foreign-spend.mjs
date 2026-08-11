/**
 * Account-wide, lifetime: where did spend actually land geographically?
 * Pulls the country breakdown first (cheap, unambiguous), then region for India
 * vs elsewhere. Answers "are we paying to show ads where we don't ship?"
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const token = process.env.META_ACCESS_TOKEN;
const acct = process.env.META_AD_ACCOUNT_ID;
const V = process.env.META_GRAPH_VERSION || "v21.0";

async function insights(params) {
  const qs = new URLSearchParams({ access_token: token, level: "account", ...params });
  const res = await fetch(`https://graph.facebook.com/${V}/${acct}/insights?${qs}`);
  const body = await res.json();
  if (body.error) {
    console.error("META ERROR:", body.error.message, `(code ${body.error.code})`);
    process.exit(1);
  }
  return body.data ?? [];
}

console.log(`account ${acct}, lifetime\n`);

const byCountry = await insights({
  date_preset: "maximum",
  breakdowns: "country",
  fields: "spend,impressions,clicks,actions,action_values",
});

const rows = byCountry
  .map((r) => {
    const purch = (r.action_values ?? []).find((a) => a.action_type === "omni_purchase" || a.action_type === "purchase");
    return {
      country: r.country,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      revenue: Number(purch?.value ?? 0),
    };
  })
  .sort((a, b) => b.spend - a.spend);

const total = rows.reduce((s, r) => s + r.spend, 0);
console.log("COUNTRY".padEnd(10) + "SPEND".padStart(14) + "SHARE".padStart(9) + "IMPRESSIONS".padStart(14) + "REVENUE".padStart(14));
console.log("-".repeat(61));
for (const r of rows) {
  console.log(
    r.country.padEnd(10) +
      Math.round(r.spend).toLocaleString("en-IN").padStart(14) +
      ((r.spend / total) * 100).toFixed(2).padStart(8) + "%" +
      r.impressions.toLocaleString("en-IN").padStart(14) +
      Math.round(r.revenue).toLocaleString("en-IN").padStart(14),
  );
}

const foreign = rows.filter((r) => r.country !== "IN");
const fSpend = foreign.reduce((s, r) => s + r.spend, 0);
const fRev = foreign.reduce((s, r) => s + r.revenue, 0);
console.log("-".repeat(61));
console.log(`TOTAL     ${Math.round(total).toLocaleString("en-IN").padStart(13)}`);
console.log(
  `\nOUTSIDE INDIA: Rs ${Math.round(fSpend).toLocaleString("en-IN")} across ${foreign.length} countries` +
    ` (${((fSpend / total) * 100).toFixed(2)}% of all spend), revenue Rs ${Math.round(fRev).toLocaleString("en-IN")}`,
);
