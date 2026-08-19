import { HeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Library is the page users reported as unresponsive, and it's the slowest to
 * arrive: it runs two SERIAL network phases before first byte — the four
 * parallel queries, then signPaths() for every thumbnail. Give it a card grid
 * that matches the real one so the wait reads as loading, not as a dead window.
 */
export default function LibraryLoading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-4 p-6">
          {/* filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="ml-auto h-9 w-28" />
          </div>

          {/* card grid — same auto-fill track as library-client */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
              >
                <Skeleton className="h-28 rounded-none" />
                <div className="flex flex-col gap-2 p-3.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <div className="flex gap-1">
                    <Skeleton className="h-4 w-16 rounded-[var(--radius-pill)]" />
                    <Skeleton className="h-4 w-12 rounded-[var(--radius-pill)]" />
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-line-2 pt-2.5">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-6 w-10" />
                    <Skeleton className="h-6 w-8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
