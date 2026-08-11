/**
 * 90% of orders come through GoKwik's checkout, so Shopify's landing_site is
 * empty for them. Enumerate every note_attribute key (and Shopify's own
 * customer-journey / marketing fields) to find where the ad id survives.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

// ---- 1. every note_attribute key, with how often it appears ---------------
const res = await fetch(
  `https://${store}/admin/api/2025-01/orders.json?status=any&limit=250` +
    `&created_at_min=2026-07-14T00:00:00%2B05:30&created_at_max=2026-07-20T00:00:00%2B05:30` +
    `&fields=id,note_attributes,landing_site,source_name,total_price`,
  { headers: H },
);
const { orders } = await res.json();

const keys = new Map(); // key -> {n, sample}
for (const o of orders) {
  for (const a of o.note_attributes ?? []) {
    const e = keys.get(a.name) ?? { n: 0, sample: "" };
    e.n++;
    if (!e.sample && a.value) e.sample = String(a.value).slice(0, 150);
    keys.set(a.name, e);
  }
}
console.log(`orders: ${orders.length}\n--- note_attribute keys ---`);
for (const [k, v] of [...keys].sort((a, b) => b[1].n - a[1].n)) {
  const hit = /utm|ad_?id|fbclid|campaign|source|referr|landing|url/i.test(k) ? "  <== ATTRIBUTION?" : "";
  console.log(`${String(v.n).padStart(4)}  ${k.padEnd(28)} ${v.sample}${hit}`);
}

// ---- 2. Shopify's own attribution, via GraphQL customerJourneySummary -----
const gid = orders.find((o) => (o.note_attributes ?? []).some((a) => a.name === "gokwik_cid"))?.id;
console.log(`\n--- customerJourneySummary for order ${gid} ---`);
const gql = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    query: `query($id: ID!) {
      order(id: $id) {
        name
        customerJourneySummary {
          momentsCount { count }
          firstVisit  { landingPage source sourceType referrerUrl utmParameters { source medium campaign content term } }
          lastVisit   { landingPage source sourceType referrerUrl utmParameters { source medium campaign content term } }
        }
      }
    }`,
    variables: { id: `gid://shopify/Order/${gid}` },
  }),
});
const body = await gql.json();
console.log(JSON.stringify(body, null, 2).slice(0, 2200));
