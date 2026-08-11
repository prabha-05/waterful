/**
 * Pull Shopify orders and aggregate revenue by (date, province). Read-only.
 * Writes an aggregate JSON to scratch so we can inspect before touching the DB.
 *
 * India is COD-heavy, so "pending" orders are real revenue awaiting delivery —
 * we count every order that has not been cancelled, and track paid separately.
 */
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2025-01";
const SINCE = process.argv[2] ?? "2026-05-01";
const OUT = process.argv[3] ?? "shopify-regional.json";

const FIELDS = [
  "id",
  "created_at",
  "total_price",
  "current_total_price",
  "financial_status",
  "cancelled_at",
  "shipping_address",
  "billing_address",
].join(",");

let url =
  `https://${store}/admin/api/${API}/orders.json?status=any&limit=250` +
  `&created_at_min=${SINCE}T00:00:00%2B05:30&fields=${FIELDS}`;

/** Shopify province → the name Meta uses, so the two sources join. */
const NORMALISE = {
  Punjab: "Punjab region",
  "Jammu and Kashmir": "Jammu and Kashmir",
  Pondicherry: "Puducherry",
  // Shopify still lists the two UTs separately; Meta reports the merged UT
  // under the shorter name, so both collapse to Meta's label.
  "Daman and Diu": "Dadra and Nagar Haveli",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

const rows = new Map(); // `${date}|${region}` -> {orders, revenue, paidOrders, paidRevenue}
let total = 0,
  cancelled = 0,
  noProvince = 0,
  pages = 0;

while (url) {
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (res.status === 429) {
    // Shopify leaky bucket — wait out the retry window and repeat the same page.
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
    const addr = o.shipping_address ?? o.billing_address;
    let region = addr?.province ?? null;
    if (!region) {
      noProvince++;
      region = "Unknown";
    }
    region = NORMALISE[region] ?? region;

    // IST date — the store, Meta reporting and the team all work in IST.
    const date = new Date(o.created_at).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const value = Number(o.current_total_price ?? o.total_price ?? 0);
    const paid = o.financial_status === "paid";

    const key = `${date}|${region}`;
    const cur = rows.get(key) ?? { orders: 0, revenue: 0, paidOrders: 0, paidRevenue: 0 };
    cur.orders++;
    cur.revenue += value;
    if (paid) {
      cur.paidOrders++;
      cur.paidRevenue += value;
    }
    rows.set(key, cur);
  }

  const link = res.headers.get("link") ?? "";
  const next = link.match(/<([^>]+)>;\s*rel="next"/);
  url = next ? next[1] : null;
  process.stdout.write(`\rpage ${pages} — ${total} orders`);
}

const out = [...rows.entries()]
  .map(([k, v]) => {
    const [date, region] = k.split("|");
    return { date, region, ...v, revenue: +v.revenue.toFixed(2), paidRevenue: +v.paidRevenue.toFixed(2) };
  })
  .sort((a, b) => (a.date === b.date ? b.revenue - a.revenue : a.date.localeCompare(b.date)));

writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log(`\n\norders since ${SINCE}: ${total} (${cancelled} cancelled, ${noProvince} without a province)`);
console.log(`rows: ${out.length} date x region combinations -> ${OUT}\n`);

const byRegion = new Map();
for (const r of out) {
  const c = byRegion.get(r.region) ?? { orders: 0, revenue: 0 };
  c.orders += r.orders;
  c.revenue += r.revenue;
  byRegion.set(r.region, c);
}
const ranked = [...byRegion.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
const grand = ranked.reduce((s, [, v]) => s + v.revenue, 0);
console.log(`TOTAL REVENUE  Rs ${Math.round(grand).toLocaleString("en-IN")}  across ${byRegion.size} regions\n`);
console.log("region".padEnd(34) + "revenue".padStart(14) + "share".padStart(9) + "orders".padStart(9));
for (const [region, v] of ranked.slice(0, 20)) {
  console.log(
    region.padEnd(34) +
      Math.round(v.revenue).toLocaleString("en-IN").padStart(14) +
      ((v.revenue / grand) * 100).toFixed(1).padStart(8) + "%" +
      String(v.orders).padStart(9),
  );
}
