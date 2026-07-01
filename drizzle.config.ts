import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Drizzle Kit config. Workflow (decisions §2): define schema → `npm run db:generate`
// → hand-add RLS + seed SQL → `npm run db:migrate` against Supabase.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://invalid",
  },
  // Supabase manages the auth schema; keep generation scoped to public.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
