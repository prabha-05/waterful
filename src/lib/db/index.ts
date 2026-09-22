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

// No query in this app legitimately runs this long (the heaviest dashboard
// roll-up is well under a second). Anything past it is a wedged socket, not a
// slow query, and is treated as such below.
const QUERY_TIMEOUT_MS = 30_000;

type Client = ReturnType<typeof postgres>;

// `prepare: false` is required for Supabase's transaction pooler (pgBouncer). Keep the
// pool small and recycle idle connections so we don't exhaust the pooler's client limit.
function openPool(): Client {
  return postgres(connectionString!, {
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
    // 2026-09-22: prod had pool connections wedged mid-query for 10 days —
    // the pooler stopped answering on a socket that TCP still considered
    // healthy, and every page that drew that slot spun forever. Recycle every
    // connection after 10 minutes and probe the socket every 30s so a dead
    // one is dropped and re-opened instead of held until the next deploy.
    max_lifetime: 600,
    keep_alive: 30,
  });
}

// Singleton across hot-reloads (dev): without this, every HMR spins up a new pool and
// leaks connections, so query latency climbs into the tens of seconds. The pool is
// held in a box (not a const) so it can be swapped out — see rotate().
const globalForDb = globalThis as unknown as { _pgPool?: { current: Client } };
const pool = globalForDb._pgPool ?? { current: openPool() };
if (process.env.NODE_ENV !== "production") globalForDb._pgPool = pool;

/**
 * A query that never answers means the connection under it is dead, and
 * postgres-js would hold that slot as "busy" until the process restarts —
 * that's how the Sep 2026 wedge accumulated. So on the first timeout we throw
 * the whole pool away and open a fresh one: every in-flight query on the old
 * pool is rejected (they were doomed anyway) and the next request gets live
 * sockets. Cheap, and it turns a days-long outage into one failed request.
 */
let rotating = false;
function rotate(reason: string) {
  if (rotating) return;
  rotating = true;
  const dead = pool.current;
  pool.current = openPool();
  console.error(`[db] query timed out (${reason}) — replacing the connection pool`);
  dead
    .end({ timeout: 1 })
    .catch(() => {})
    .finally(() => {
      rotating = false;
    });
}

function withTimeout<T>(run: () => PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      rotate(label);
      reject(new Error(`Database did not answer within ${QUERY_TIMEOUT_MS / 1000}s — please retry.`));
    }, QUERY_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(run()), timeout]).finally(() => clearTimeout(timer));
}

// postgres-js queries are lazy: nothing runs until they're awaited (or .values()
// is called, which is what Drizzle does). This wraps that moment so every query
// in the app — Drizzle and raw tagged-template alike — carries the timeout,
// while `sqlClient(identifier)` helpers and everything else pass straight through.
type Query = PromiseLike<unknown> & { values?: () => PromiseLike<unknown> };
function guard(q: Query, label: string) {
  const p = () => withTimeout(() => q, label);
  return {
    then: (a?: (v: unknown) => unknown, b?: (e: unknown) => unknown) => p().then(a, b),
    catch: (b?: (e: unknown) => unknown) => p().catch(b),
    finally: (f?: () => void) => p().finally(f),
    values: () => withTimeout(() => q.values!(), label),
  };
}

const client = new Proxy(pool.current, {
  apply(_t, _this, args: unknown[]) {
    const q = (pool.current as unknown as (...a: unknown[]) => Query)(...args);
    // Only a tagged-template call (sqlClient`…`) is a query. sqlClient("table")
    // builds an identifier for embedding in another query, and postgres-js
    // recognises it by class — so it must be handed back untouched.
    const tagged = Array.isArray(args[0]) && "raw" in (args[0] as object);
    return tagged ? guard(q, "sql") : q;
  },
  get(_t, prop: string | symbol) {
    const cur = pool.current as unknown as Record<string | symbol, unknown>;
    if (prop === "unsafe") {
      return (...args: unknown[]) =>
        guard((cur.unsafe as (...a: unknown[]) => Query)(...args), "unsafe");
    }
    const v = cur[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(pool.current) : v;
  },
}) as Client;

export const db = drizzle(client, { schema });
// Raw tagged-template client for the heavier read aggregations (dashboard tree,
// per-creative metric roll-ups) where hand-written SQL is clearer than the query builder.
export const sqlClient = client;
export { schema };
