import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

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

  // IMPORTANT: getUser() revalidates the token with Supabase — do not trust getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
