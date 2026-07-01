# Waterful — Ad Performance OS

Internal system of record that ties every Meta ad back to a deliberate **Angle /
Persona** hypothesis. Built per `../Waterful_Ad_Performance_OS_Decisions_v3 (1).md`
(authority) on top of the design bundle in `../design_handoff_waterful/`.

**Stack** (decisions §2): TypeScript · Next.js 16 (App Router, RSC/server actions) ·
Tailwind v4 · Supabase (Auth + Postgres + Storage) · Drizzle · TanStack Query ·
Render (web + cron/worker).

> **Status: Phase 0 (foundation) complete.** Auth + role gate + enforcement,
> seeded taxonomy, schema/migrations/RLS, and the perm-gated app shell are in.
> The screens themselves are placeholders built in Phases 1–4 (§8).

---

## First-time setup

1. **Create a Supabase project**, then in **Settings → API** copy the project URL
   and anon key; in **Settings → Database** copy the connection string.

2. **Env**: `cp .env.example .env.local` and fill in the values.

3. **Enable Google auth**: Supabase → **Authentication → Providers → Google**.
   Add your Google OAuth client ID/secret. Add the callback
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback` to Google, and add
   `http://localhost:3000/auth/callback` (and your Render URL) to Supabase
   **Redirect URLs**.

4. **Run migrations** (creates schema → RLS → seed, in order):
   ```bash
   npm run db:migrate
   ```
   This seeds roles (Admin/Performance/Content/Viewer), the `@stranza.in` team
   (Prabha/Muyeen = Admin), and the full taxonomy.

   > The seeded users authorize a Google login *by email*. To actually sign in,
   > the Google account's email must match a seeded `users.email`. Use one of the
   > seeded admin emails (or update a seeded row to your own Google email).

5. **Dev**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 → redirected to `/login` (Google SSO).

### Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server (Turbopack) |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (schema + RLS + seed) |
| `npm run db:studio` | Drizzle Studio |
| `npm run worker:sync` | Run the Meta sync worker once (nightly 28-day re-pull) |

---

## Enforcement model (decisions §3–§4)

- **Authentication** = Google SSO (Supabase Auth). Proves *who* you are.
- **Authorization** = a valid, non-archived `users.role_id` mapping. Proves
  *whether* you're in and *what* you can do (the six permissions:
  `upload, link, unlink, log, master, access`).
- **`src/proxy.ts`** (Next 16's renamed Middleware, Node runtime) refreshes the
  Supabase session and bounces unauthenticated requests to `/login`.
- **`src/app/(app)/layout.tsx`** resolves the user→role via Drizzle every request
  and redirects to `/no-access` when there's no valid role (the in-session gate).
- **App layer is the primary check**: every mutating Server Action / Route Handler
  must verify the permission server-side. **Supabase RLS is the backstop**
  (`drizzle/0001_rls_baseline.sql`).
- ⚠️ **RLS only bites over a Supabase-authenticated connection** (the
  `authenticated` Postgres role with the user's JWT). A plain Drizzle connection
  on the service/owner role bypasses RLS by design — that's intended for the
  Meta worker, but means web-app reads/writes that must respect RLS need the user
  JWT threaded through (PostgREST, or Drizzle + `set local role authenticated`).
  Settle this when wiring Phase 1 data access. UI hide/show is cosmetic only.

---

## Layout
```
src/
  proxy.ts                     # Next 16 proxy: session refresh + auth redirect
  app/
    login/                     # Google SSO surface (no password — G4)
    auth/callback|signout/     # OAuth code exchange / sign out
    no-access/                 # no-role gate (HANDOVER §2)
    (app)/                     # authenticated shell (sidebar + perm-gated nav)
      layout.tsx               # role gate + shell
      library|dashboard|awaiting|master-data|access|meta-sync|settings/
  components/app-shell/        # sidebar, page-header, placeholder
  components/providers/        # TanStack Query provider
  lib/
    db/{schema,index}.ts       # Drizzle schema (decisions §7) + client
    supabase/{server,client,middleware}.ts
    auth/{session,permissions}.ts
    nav.ts, env.ts, utils.ts
  worker/meta-sync.ts          # Render cron worker (Meta sync — §6; stub)
drizzle/
  0000_init.sql                # schema
  0001_rls_baseline.sql        # RLS backstop (six-permission policies)
  0002_bootstrap_seed.sql      # roles + team + taxonomy
render.yaml                    # two services: web + cron worker
```

## Open decisions (decisions §9 — settle during build)
- Session lifetime before re-login.
- Single-ad vs all-ads default for manual sync.
- `creative_files` direct-to-Storage upload for large video.
- Which range-level reach/frequency windows to capture (≥ lifetime + last_7 +
  prior_7) — modeled now in `ad_range_metrics`.
