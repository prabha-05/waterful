/** Load shopify-ad-revenue.json into shopify_ad_revenue. */
import { readFileSync } from "node:fs";
import postgres from "postgres";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = JSON.parse(readFileSync(process.argv[2] ?? "shopify-ad-revenue.json", "utf8"));
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200).map((r) => ({
    ad_id: r.adId, as_of_date: r.date, region: r.region, orders: r.orders, revenue: r.revenue,
  }));
  await sql`insert into shopify_ad_revenue ${sql(chunk)}
    on conflict (ad_id, as_of_date, region) do update set
      orders = excluded.orders, revenue = excluded.revenue, synced_at = now()`;
}
const [t] = await sql`select count(*)::int rows, count(distinct ad_id)::int ads, round(sum(revenue)) total from shopify_ad_revenue`;
console.log(`loaded ${t.rows} rows | ${t.ads} ads | Rs ${Number(t.total).toLocaleString("en-IN")}`);
await sql.end();
