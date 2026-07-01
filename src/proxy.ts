import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 Proxy (formerly Middleware). Node.js runtime.
 *
 * Responsibility = AUTHENTICATION only:
 *   - refresh the Supabase session on every request,
 *   - bounce unauthenticated users to /login,
 *   - bounce authenticated users away from /login.
 *
 * AUTHORIZATION (valid role / no-role gate, the six permissions) is enforced
 * server-side in the (app) layout + every Server Action/Route Handler — the
 * primary app-layer check — with Supabase RLS as the backstop (decisions §3–§4).
 */

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
