import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { timed } from "@/lib/perf";

// Max time to wait on Supabase auth before treating the request as logged out.
const AUTH_TIMEOUT_MS = 2500;

/**
 * Refresh the Supabase session on each request and expose the authenticated user.
 * Used by `src/proxy.ts` (Next.js 16 renamed Middleware → Proxy).
 *
 * Returns the response (carrying refreshed auth cookies) plus the current user.
 * Authorization (valid role / no-role gate) is resolved per request in the
 * (app) layout via Drizzle — see decisions §3 "Enforced server-side every request".
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Verify the session locally from the JWT (getClaims validates the token's
  // signature without a network round-trip, and still rotates the cookie when the
  // token needs refreshing). This runs on EVERY navigation — using getUser() here
  // meant a cross-region call to Supabase auth (Mumbai) per click, which stalls the
  // whole app when their auth service is slow. Claims are enough for the auth gate;
  // authorization (roles/permissions) is resolved in the (app) layout.
  //
  // FAIL-FAST: when the access token is expired, getClaims must refresh it over the
  // network (a call to Supabase auth). If that service is degraded the call can hang
  // for minutes and freeze the page — including /login, which also runs the proxy.
  // Cap it: if auth doesn't answer in AUTH_TIMEOUT_MS we treat the request as logged
  // out (→ bounced to /login) instead of blocking. A healthy local verify is <5ms, so
  // this only ever trips during an outage.
  const user = await timed("proxy.getClaims", async () => {
    try {
      const data = await Promise.race([
        supabase.auth.getClaims().then((r) => r.data),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("auth-timeout")), AUTH_TIMEOUT_MS),
        ),
      ]);
      return data?.claims ?? null;
    } catch {
      // Timed out or auth errored — degrade to "no session" so the page still renders.
      return null;
    }
  });

  return { response, user };
}
