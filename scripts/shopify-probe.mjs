/**
 * Probe the Shopify Admin API: does the token work, what scopes does it have,
 * and can we actually read orders with a shipping province? Read-only.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const store = process.env.SHOPIFY_STORE_URL;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2025-01";

async function call(path) {
  const res = await fetch(`https://${store}/admin/api/${API}/${path}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log(`store: ${store}\n`);

const shop = await call("shop.json");
if (shop.status !== 200) {
  console.log(`FAILED shop.json → HTTP ${shop.status}`);
  console.log(JSON.stringify(shop.body, null, 2));
  process.exit(1);
}
console.log(`shop OK: ${shop.body.shop.name} | currency ${shop.body.shop.currency} | ${shop.body.shop.country_name}`);
console.log(`created: ${shop.body.shop.created_at}\n`);

const scopes = await call("oauth/access_scopes.json");
console.log("scopes:", scopes.body?.access_scopes?.map((s) => s.handle).join(", ") ?? `HTTP ${scopes.status}`);

const count = await call("orders/count.json?status=any");
console.log("orders (any status):", count.body?.count ?? `HTTP ${count.status}`);

const since = await call("orders/count.json?status=any&created_at_min=2026-05-01T00:00:00Z");
console.log("orders since 1 May 2026:", since.body?.count ?? `HTTP ${since.status}`);

const sample = await call(
  "orders.json?status=any&limit=3&fields=id,created_at,total_price,currency,financial_status,shipping_address&created_at_min=2026-07-01T00:00:00Z",
);
console.log(`\nsample orders (HTTP ${sample.status}):`);
for (const o of sample.body?.orders ?? []) {
  const a = o.shipping_address;
  console.log(
    `  ${o.created_at.slice(0, 10)}  ${o.currency} ${o.total_price}  ${o.financial_status}  ` +
      `province=${a?.province ?? "(none)"} / ${a?.city ?? "-"} / ${a?.country_code ?? "-"}`,
  );
}
if (sample.status !== 200) console.log(JSON.stringify(sample.body, null, 2));
