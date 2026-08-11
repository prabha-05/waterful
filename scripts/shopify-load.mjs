/** Load the aggregate produced by shopify-pull.mjs into shopify_regional_revenue. */
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = JSON.parse(readFileSync(process.argv[2] ?? "shopify-regional.json", "utf8"));

for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200).map((r) => ({
    as_of_date: r.date,
    region: r.region,
    orders: r.orders,
    revenue: r.revenue,
    paid_orders: r.paidOrders,
    paid_revenue: r.paidRevenue,
  }));
  await sql`
    insert into shopify_regional_revenue ${sql(chunk)}
    on conflict (as_of_date, region) do update set
      orders = excluded.orders, revenue = excluded.revenue,
      paid_orders = excluded.paid_orders, paid_revenue = excluded.paid_revenue,
      synced_at = now()`;
}

const [t] = await sql`
  select count(*)::int rows, count(distinct region)::int regions,
         min(as_of_date)::text lo, max(as_of_date)::text hi, round(sum(revenue)) total
  from shopify_regional_revenue`;
console.log(`loaded ${t.rows} rows | ${t.regions} regions | ${t.lo} -> ${t.hi} | Rs ${Number(t.total).toLocaleString("en-IN")}`);
await sql.end();
