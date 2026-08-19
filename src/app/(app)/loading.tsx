import { HeaderSkeleton, TilesSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Default loading state for every route in the (app) group.
 *
 * Two things depend on this file existing, not just one:
 *   1. The router has something to paint the instant a link is clicked, instead
 *      of freezing on the previous page until the server answers.
 *   2. Next only prefetches a DYNAMIC route when it has a loading boundary —
 *      every page here is dynamic (auth per request), so without this, <Link>
 *      prefetch was doing nothing at all.
 *
 * Routes with a distinctly different shape (Library's card grid) override this
 * with their own loading.tsx.
 */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-4 p-6">
          <TilesSkeleton />
          <TableSkeleton />
        </div>
      </div>
    </>
  );
}
