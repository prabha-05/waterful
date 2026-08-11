/**
 * TRUE per-ad revenue from Shopify.
 *
 * Meta ads carry utm_content={{ad.id}} into the landing URL. GoKwik (which
 * handles ~90% of checkouts) copies that onto the order as a note_attribute;
 * the remaining orders keep it in Shopify's own landing_site. Reading both
 * gives revenue attributed to a specific ad AND a specific state — the one
 * thing neither Meta nor Shopify reports on its own.
 *
 * Last-click by construction: this is the UTM the customer arrived with.
 */
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const SINCE = process.argv[2] ?? "2026-05-01";
const OUT = process.argv[3] ?? "shopify-ad-revenue.json";

const NORMALISE = {
  Punjab: "Punjab region",
  Pondicherry: "Puducherry",
  "Daman and Diu": "Dadra and Nagar Haveli",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

const FIELDS =
  "id,created_at,total_price,current_total_price,cancelled_at,shipping_address,billing_address,note_attributes,landing_site";
let url =
  `https://${store}/admin/api/2025-01/orders.json?status=any&limit=250` +
  `&created_at_min=${SINCE}T00:00:00%2B05:30&fields=${FIELDS}`;

const AD_ID = /^\d{15,20}$/; // Meta ad ids are currently 18 digits

/** The ad id the customer arrived with, from whichever field survived. */
function adIdOf(order) {
  const notes = new Map((order.note_attributes ?? []).map((a) => [a.name, String(a.value ?? "")]));

  const direct = notes.get("utm_content");
  if (direct && AD_ID.test(direct.trim())) return direct.trim();

  for (const field of [notes.get("full_url"), order.landing_site]) {
    if (!field || !field.includes("?")) continue;
    const v = new URLSearchParams(field.split("?").slice(1).join("?")).get("utm_content");
    if (v && AD_ID.test(v.trim())) return v.trim();
  }
  return null;
}

const rows = new Map(); // adId|date|region -> {orders, revenue}
let total = 0,
  cancelled = 0,
  attributed = 0,
  attributedValue = 0,
  totalValue = 0,
  pages = 0;

while (url) {
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 2) * 1000));
    continue;
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, await res.text());
    process.exit(1);
  }
  const { orders } = await res.json();
  pages++;

  for (const o of orders) {
    total++;
    if (o.cancelled_at) {
      cancelled++;
      continue;
    }
    const value = Number(o.current_total_price ?? o.total_price ?? 0);
    totalValue += value;

    const adId = adIdOf(o);
    if (!adId) continue;
    attributed++;
    attributedValue += value;

    const addr = o.shipping_address ?? o.billing_address;
    const region = NORMALISE[addr?.province] ?? addr?.province ?? "Unknown";
    const date = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const key = `${adId}|${date}|${region}`;
    const cur = rows.get(key) ?? { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += value;
    rows.set(key, cur);
  }

  const next = (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
  url = next ? next[1] : null;
  process.stdout.write(`\rpage ${pages} — ${total} orders, ${attributed} ad-attributed`);
}

const out = [...rows.entries()].map(([k, v]) => {
  const [adId, date, region] = k.split("|");
  return { adId, date, region, orders: v.orders, revenue: +v.revenue.toFixed(2) };
});
writeFileSync(OUT, JSON.stringify(out, null, 1));

const live = total - cancelled;
console.log(`\n\norders since ${SINCE}: ${total} (${cancelled} cancelled)`);
console.log(
  `attributed to a specific ad: ${attributed}/${live} orders (${((attributed / live) * 100).toFixed(1)}%)`,
);
console.log(
  `attributed revenue: Rs ${Math.round(attributedValue).toLocaleString("en-IN")} of Rs ${Math.round(totalValue).toLocaleString("en-IN")} (${((attributedValue / totalValue) * 100).toFixed(1)}%)`,
);
console.log(`distinct ads: ${new Set(out.map((r) => r.adId)).size} -> ${out.length} rows in ${OUT}`);

const byAd = new Map();
for (const r of out) {
  const c = byAd.get(r.adId) ?? { orders: 0, revenue: 0 };
  c.orders += r.orders;
  c.revenue += r.revenue;
  byAd.set(r.adId, c);
}
console.log("\ntop ads by Shopify-attributed revenue:");
for (const [ad, v] of [...byAd].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 12)) {
  console.log(`  ${ad}  Rs ${Math.round(v.revenue).toLocaleString("en-IN").padStart(10)}  ${String(v.orders).padStart(4)} orders`);
}
