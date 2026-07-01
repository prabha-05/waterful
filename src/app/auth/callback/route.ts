import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth callback — exchanges the Google auth code for a Supabase session,
 * then sends the user into the app. The (app) layout enforces the no-role gate.
 *
 * Behind a proxy (Render/Vercel), `request.url` reflects the INTERNAL host
 * (e.g. localhost:10000), so we must rebuild the public origin from the
 * X-Forwarded-* headers — otherwise the post-login redirect goes to a dead
 * internal address.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const publicOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : origin;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${publicOrigin}${next}`);
    }
  }

  // Auth failed — back to login.
  return NextResponse.redirect(`${publicOrigin}/login`);
}
