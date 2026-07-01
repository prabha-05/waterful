import "server-only";

/**
 * Lightweight server-side timing. Wraps an async unit of work and logs its
 * duration to stdout (visible in Render "Live tail" logs) when it crosses a
 * threshold — so we can see per-request which step is slow without a profiler.
 * Temporary diagnostic; safe to leave on (only logs the slow ones).
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    if (ms >= 30) console.log(`[perf] ${label} ${ms}ms`);
  }
}
