/**
 * Does Shopify know which AD drove each order? Checks the fields that can carry
 * ad-level attribution: landing_site (UTM query string), referring_site,
 * source_name and note_attributes. Read-only, recent orders only.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;

const FIELDS = "id,created_at,total_price,landing_site,referring_site,source_name,note_attributes,customer_locale";
const url =
  `https://${store}/admin/api/2025-01/orders.json?status=any&limit=250` +
  `&created_at_min=2026-07-14T00:00:00%2B05:30&created_at_max=2026-07-20T00:00:00%2B05:30&fields=${FIELDS}`;

const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
const { orders } = await res.json();
console.log(`orders 14-19 July: ${orders.length}\n`);

const srcCount = new Map();
const utmKeys = new Map();
let withLanding = 0,
  withUtm = 0,
  withAdId = 0;
const samples = [];

for (const o of orders) {
  srcCount.set(o.source_name, (srcCount.get(o.source_name) ?? 0) + 1);
  if (!o.landing_site) continue;
  withLanding++;
  const q = o.landing_site.includes("?") ? o.landing_site.split("?")[1] : "";
  if (!q) continue;
  const params = new URLSearchParams(q);
  let any = false;
  for (const [k, v] of params) {
    if (/^utm_|fbclid|ad_id|adset|campaign|gclid|ttclid/i.test(k)) {
      any = true;
      const set = utmKeys.get(k) ?? new Set();
      if (set.size < 6) set.add(v.slice(0, 60));
      utmKeys.set(k, set);
      // A 15-17 digit number is a Meta object id — that is ad-level precision.
      if (/^\d{15,17}$/.test(v)) withAdId++;
    }
  }
  if (any) {
    withUtm++;
    if (samples.length < 5) samples.push(o.landing_site.slice(0, 220));
  }
}

console.log("source_name breakdown:");
for (const [k, v] of [...srcCount].sort((a, b) => b[1] - a[1])) console.log(`  ${k ?? "(null)"}: ${v}`);

console.log(`\nlanding_site present : ${withLanding}/${orders.length}`);
console.log(`carrying UTM/click id: ${withUtm}/${orders.length}`);
console.log(`carrying a Meta-style id (15-17 digits): ${withAdId}`);

console.log("\ntracking params seen:");
if (utmKeys.size === 0) console.log("  (none)");
for (const [k, vals] of utmKeys) console.log(`  ${k} = ${[...vals].join(" | ")}`);

console.log("\nsample landing_site values:");
for (const s of samples) console.log(`  ${s}`);
if (samples.length === 0) {
  const withAny = orders.filter((o) => o.landing_site).slice(0, 4);
  for (const o of withAny) console.log(`  (no utm) ${o.landing_site.slice(0, 160)}`);
}

const notes = orders.filter((o) => (o.note_attributes ?? []).length > 0);
console.log(`\norders with note_attributes: ${notes.length}`);
if (notes[0]) console.log("  e.g.", JSON.stringify(notes[0].note_attributes).slice(0, 300));
