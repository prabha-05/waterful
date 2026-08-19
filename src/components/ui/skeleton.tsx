import { cn } from "@/lib/utils";

/**
 * Placeholder block for route-level loading states.
 *
 * Uses `surface-2` so a skeleton reads as "this is arriving" rather than as an
 * empty card. Every page in the (app) group renders one of these while its
 * server data resolves — without it Next has nothing to paint during a dynamic
 * route's fetch, so the browser sits on the PREVIOUS page with no feedback and
 * the click appears to do nothing (measured: ~1.4s of auth alone per request).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-surface-2", className)}
    />
  );
}

/** Header band placeholder — matches PageHeader's 68px / px-7 geometry exactly. */
export function HeaderSkeleton() {
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-surface px-7">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-72" />
      </div>
      <Skeleton className="h-9 w-28" />
    </header>
  );
}

/** Stat tile row — the shape every metrics page opens with. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Grid-table placeholder — header strip plus n rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="border-b border-line-2 px-4 py-2.5">
        <Skeleton className="h-3 w-32" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 border-b border-line-2 px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}
