/*
 * Shopify revenue refresh — runs as part of every Meta sync.
 *
 * Meta strips conversion actions from any geographic breakdown, so revenue by
 * state cannot come from Meta at all. It comes from the store: Meta ads carry
 * utm_content={{ad.id}} into the landing URL, GoKwik (which handles ~90% of
 * checkouts) copies that onto the order, and the order knows its shipping state.
 * Joining the two gives revenue for one ad, in one state, from real orders.
 *
 * Last-click by construction, and only ~57% of orders keep the tag, so what this
 * writes is a measured FLOOR — the UI says so next to the number.
 *
 * Not `server-only`: the standalone cron worker imports this too (see lib/meta/sync.ts).
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shopifyAdRevenue, shopifyRegionalRevenue } from "@/lib/db/schema";

const API = "2025-01";

/** Meta ad ids are currently 18 digits; allow a margin either side. */
const AD_ID = /^\d{15,20}$/;

/** Shopify province → the name Meta uses, so the two sources join. */
const NORMALISE: Record<string, string> = {
  Punjab: "Punjab region",
  Pondicherry: "Puducherry",
  // Shopify still lists the two UTs separately; Meta reports the merged UT
  // under the shorter name, so both collapse to Meta's label.
  "Daman and Diu": "Dadra and Nagar Haveli",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

type Order = {
  created_at: string;
  total_price?: string;
  current_total_price?: string;
  cancelled_at?: string | null;
  financial_status?: string | null;
  shipping_address?: { province?: string | null } | null;
  billing_address?: { province?: string | null } | null;
  note_attributes?: { name: string; value: string }[];
  landing_site?: string | null;
};

export type ShopifyRefresh =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; orders: number; attributed: number; adRows: number; regionRows: number }
  | { ok: false; error: string };

/** The ad id the customer arrived with, from whichever field survived checkout. */
function adIdOf(order: Order): string | null {
  const notes = new Map((order.note_attributes ?? []).map((a) => [a.name, String(a.value ?? "")]));

  const direct = notes.get("utm_content")?.trim();
  if (direct && AD_ID.test(direct)) return direct;

  // GoKwik stores the whole landing URL; non-GoKwik orders keep Shopify's own.
  for (const field of [notes.get("full_url"), order.landing_site]) {
    if (!field || !field.includes("?")) continue;
    const v = new URLSearchParams(field.split("?").slice(1).join("?")).get("utm_content")?.trim();
    if (v && AD_ID.test(v)) return v;
  }
  return null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Re-pull Shopify orders and upsert both revenue tables.
 * `since` defaults to 28 days back, matching the rolling Meta window.
 * Returns `skipped` rather than failing when the store isn't configured, so a
 * Meta sync still succeeds on an environment with no Shopify credentials.
 */
export async function refreshShopifyRevenue(since?: Date): Promise<ShopifyRefresh> {
  const store = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!store || !token) {
    return { ok: true, skipped: true, reason: "SHOPIFY_STORE_URL / SHOPIFY_ACCESS_TOKEN not set" };
  }

  const from = since ?? new Date(Date.now() - 28 * 86400000);

  const FIELDS =
    "id,created_at,total_price,current_total_price,cancelled_at,financial_status," +
    "shipping_address,billing_address,note_attributes,landing_site";
  let url: string | null =
    `https://${store}/admin/api/${API}/orders.json?status=any&limit=250` +
    `&created_at_min=${ymd(from)}T00:00:00%2B05:30&fields=${FIELDS}`;

  // key → aggregate. Dates are IST: the store, Meta reporting and the team all
  // work in IST, so a UTC date would split a day at 05:30 local.
  const byAd = new Map<string, { adId: string; date: string; region: string; orders: number; revenue: number }>();
  const byRegion = new Map<
    string,
    { date: string; region: string; orders: number; revenue: number; paidOrders: number; paidRevenue: number }
  >();

  let total = 0;
  let attributed = 0;

  try {
    while (url) {
      const res: Response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token },
        cache: "no-store",
      });

      if (res.status === 429) {
        // Shopify leaky bucket — wait out the window and repeat the same page.
        const wait = Number(res.headers.get("retry-after")) || 2;
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) {
        return { ok: false, error: `Shopify HTTP ${res.status}: ${await res.text()}` };
      }

      const { orders } = (await res.json()) as { orders: Order[] };

      for (const o of orders) {
        total++;
        if (o.cancelled_at) continue;

        const value = Number(o.current_total_price ?? o.total_price ?? 0);
        const addr = o.shipping_address ?? o.billing_address;
        const province = addr?.province ?? null;
        const region = province ? (NORMALISE[province] ?? province) : "Unknown";
        const date = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const paid = o.financial_status === "paid";

        // Store-wide, by region and day.
        const rKey = `${date}|${region}`;
        const r = byRegion.get(rKey) ?? { date, region, orders: 0, revenue: 0, paidOrders: 0, paidRevenue: 0 };
        r.orders++;
        r.revenue += value;
        if (paid) {
          r.paidOrders++;
          r.paidRevenue += value;
        }
        byRegion.set(rKey, r);

        // Attributed to one ad, when the tag survived.
        const adId = adIdOf(o);
        if (!adId) continue;
        attributed++;
        const aKey = `${adId}|${date}|${region}`;
        const a = byAd.get(aKey) ?? { adId, date, region, orders: 0, revenue: 0 };
        a.orders++;
        a.revenue += value;
        byAd.set(aKey, a);
      }

      const next = (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Upsert, chunked — Postgres caps a statement at 65535 bind parameters.
  const adRows = [...byAd.values()];
  for (let i = 0; i < adRows.length; i += 500) {
    await db
      .insert(shopifyAdRevenue)
      .values(
        adRows.slice(i, i + 500).map((r) => ({
          adId: r.adId,
          asOfDate: r.date,
          region: r.region,
          orders: r.orders,
          revenue: r.revenue.toFixed(2),
          syncedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [shopifyAdRevenue.adId, shopifyAdRevenue.asOfDate, shopifyAdRevenue.region],
        set: {
          orders: sql`excluded.orders`,
          revenue: sql`excluded.revenue`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  const regionRows = [...byRegion.values()];
  for (let i = 0; i < regionRows.length; i += 500) {
    await db
      .insert(shopifyRegionalRevenue)
      .values(
        regionRows.slice(i, i + 500).map((r) => ({
          asOfDate: r.date,
          region: r.region,
          orders: r.orders,
          revenue: r.revenue.toFixed(2),
          paidOrders: r.paidOrders,
          paidRevenue: r.paidRevenue.toFixed(2),
          syncedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [shopifyRegionalRevenue.asOfDate, shopifyRegionalRevenue.region],
        set: {
          orders: sql`excluded.orders`,
          revenue: sql`excluded.revenue`,
          paidOrders: sql`excluded.paid_orders`,
          paidRevenue: sql`excluded.paid_revenue`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  return {
    ok: true,
    skipped: false,
    orders: total,
    attributed,
    adRows: adRows.length,
    regionRows: regionRows.length,
  };
}
