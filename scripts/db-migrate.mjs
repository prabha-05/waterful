/**
 * Reliable migration runner for Supabase's pooler (drizzle-kit's CLI migrate has
 * a quirk against pgBouncer). Reads drizzle/meta/_journal.json, applies any
 * pending migration files in order, and tracks applied ones in a small table so
 * it's idempotent.
 *
 * Run: node --env-file=.env.local scripts/db-migrate.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.unsafe(
    `create table if not exists public.__waterful_migrations (
       tag text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  );
  const applied = new Set(
    (await sql`select tag from public.__waterful_migrations`).map((r) => r.tag),
  );

  let ran = 0;
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) {
      console.log(`• skip ${entry.tag} (already applied)`);
      continue;
    }
    const raw = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
    const stmts = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) await sql.unsafe(stmt);
    await sql`insert into public.__waterful_migrations (tag) values (${entry.tag})`;
    console.log(`✓ applied ${entry.tag} (${stmts.length} statements)`);
    ran++;
  }
  console.log(ran === 0 ? "\nUp to date — nothing to apply." : `\nApplied ${ran} migration(s).`);
} catch (e) {
  console.error("\n❌ Migration failed:", e.message);
  process.exit(2);
} finally {
  await sql.end();
}
