import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle client over Supabase Postgres (decisions §2).
 * Uses DATABASE_URL — the Supabase connection string (pooled/transaction mode for
 * the web app; the worker may use a direct connection).
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it from your Supabase project (Settings → Database → Connection string).",
  );
}

// `prepare: false` is required for Supabase's transaction pooler (pgBouncer). Keep the
// pool small and recycle idle connections so we don't exhaust the pooler's client limit.
// Singleton across hot-reloads (dev): without this, every HMR spins up a new pool and
// leaks connections, so query latency climbs into the tens of seconds.
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb._pgClient ??
  postgres(connectionString, {
    prepare: false, // required for pgBouncer transaction pooler
    fetch_types: false, // skip per-connection pg_catalog type lookups (pooler-friendly)
    max: 8,
    // Keep connections warm. At idle_timeout: 20 an internal tool with a handful
    // of users found a cold pool on nearly every request and paid a fresh TLS +
    // auth handshake to Mumbai — measured as 393ms for a single indexed lookup
    // on users.email. 10 minutes spans normal think-time between clicks, and
    // `max: 8` still caps our share of the pooler.
    idle_timeout: 600,
    connect_timeout: 10, // fail a stalled connection fast instead of hanging for minutes
  });

if (process.env.NODE_ENV !== "production") globalForDb._pgClient = client;

export const db = drizzle(client, { schema });
// Raw tagged-template client for the heavier read aggregations (dashboard tree,
// per-creative metric roll-ups) where hand-written SQL is clearer than the query builder.
export const sqlClient = client;
export { schema };
