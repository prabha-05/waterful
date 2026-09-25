import { NextResponse } from "next/server";
import { sqlClient } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe — no data, no secrets, just "is this process
 * healthy and which build is it running". Added 2026-09-25 after two outages
 * where the only way to tell whether a fix was live was to guess.
 *
 * Point Render's health check at this path: it answers 503 when the database
 * is unreachable, so a wedged instance gets replaced instead of serving
 * hanging pages.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbMs: number | null = null;
  let dbError: string | null = null;

  try {
    const t = Date.now();
    await sqlClient`select 1`;
    dbMs = Date.now() - t;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const body = {
    ok: dbError === null,
    // Render injects these; they say exactly which commit is serving traffic.
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "unknown",
    branch: process.env.RENDER_GIT_BRANCH ?? "unknown",
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    db: { ms: dbMs, error: dbError },
    totalMs: Date.now() - startedAt,
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
