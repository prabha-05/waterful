/**
 * Audit trail for one ad: every Shopify order tagged with its id, with the
 * order number, state, amount and the raw utm_content the customer arrived
 * with — plus a direct admin link so each one can be opened and checked by eye.
 *
 *   node scripts/verify-ad-orders.mjs <adId> [sinceISO]
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const handle = store.replace(".myshopify.com", "");

const AD = process.argv[2];
const SINCE = process.argv[3] ?? "2026-05-01";
if (!AD) {
  console.error("usage: node scripts/verify-ad-orders.mjs <adId> [sinceISO]");
  process.exit(1);
}

const AD_ID = /^\d{15,20}$/;
const NORMALISE = {
  Punjab: "Punjab region",
  Pondicherry: "Puducherry",
  "Daman and Diu": "Dadra and Nagar Haveli",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

function attribution(order) {
  const notes = new Map((order.note_attributes ?? []).map((a) => [a.name, String(a.value ?? "")]));
  const direct = notes.get("utm_content");
  if (direct && AD_ID.test(direct.trim())) return { adId: direct.trim(), via: "note_attributes.utm_content" };
  for (const [via, field] of [["note_attributes.full_url", notes.get("full_url")], ["landing_site", order.landing_site]]) {
    if (!field || !field.includes("?")) continue;
    const v = new URLSearchParams(field.split("?").slice(1).join("?")).get("utm_content");
    if (v && AD_ID.test(v.trim())) return { adId: v.trim(), via };
  }
  return null;
}

const FIELDS =
  "id,name,order_number,created_at,total_price,current_total_price,cancelled_at,financial_status," +
  "shipping_address,billing_address,note_attributes,landing_site";
let url =
  `https://${store}/admin/api/2025-01/orders.json?status=any&limit=250` +
  `&created_at_min=${SINCE}T00:00:00%2B05:30&fields=${FIELDS}`;

const hits = [];
let scanned = 0;
while (url) {
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 2) * 1000));
    continue;
  }
  const { orders } = await res.json();
  scanned += orders.length;
  for (const o of orders) {
    if (o.cancelled_at) continue;
    const a = attribution(o);
    if (a?.adId !== AD) continue;
    const addr = o.shipping_address ?? o.billing_address;
    hits.push({
      name: o.name,
      id: o.id,
      date: new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }),
      region: NORMALISE[addr?.province] ?? addr?.province ?? "Unknown",
      city: addr?.city ?? "-",
      value: Number(o.current_total_price ?? o.total_price ?? 0),
      status: o.financial_status,
      via: a.via,
    });
  }
  const next = (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
  url = next ? next[1] : null;
  process.stdout.write(`\rscanned ${scanned} orders...`);
}

console.log(`\n\nAd ${AD} — ${hits.length} orders, Rs ${Math.round(hits.reduce((s, h) => s + h.value, 0)).toLocaleString("en-IN")}\n`);
console.log(
  "ORDER".padEnd(9) + "DATE".padEnd(23) + "STATE".padEnd(16) + "CITY".padEnd(14) + "AMOUNT".padStart(10) + "  STATUS",
);
console.log("-".repeat(84));
for (const h of hits.sort((a, b) => a.region.localeCompare(b.region))) {
  console.log(
    h.name.padEnd(9) +
      h.date.padEnd(23) +
      h.region.slice(0, 15).padEnd(16) +
      String(h.city).slice(0, 13).padEnd(14) +
      Math.round(h.value).toLocaleString("en-IN").padStart(10) +
      "  " + h.status,
  );
}

console.log("\nOpen any of these in Shopify to confirm the tag yourself:");
for (const h of hits.slice(0, 10)) {
  console.log(`  ${h.name}  https://admin.shopify.com/store/${handle}/orders/${h.id}`);
}
console.log("\n(In the order page, scroll to 'Additional details' — utm_content is the ad id.)");

const byRegion = new Map();
for (const h of hits) byRegion.set(h.region, (byRegion.get(h.region) ?? 0) + h.value);
console.log("\nper-state total (this is what the app shows):");
for (const [r, v] of [...byRegion].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${r.padEnd(18)} Rs ${Math.round(v).toLocaleString("en-IN")}`);
}
