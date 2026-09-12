/**
 * Route-level loading UI. `listWatches` runs one query for the watches and one
 * for their observation series, so the screen has a real (if short) wait on a
 * cold navigation.
 *
 * Skeleton rows, not sample rows: every block is a blank surface, so nothing
 * here can be mistaken for a product, a price or a trend that does not exist.
 * The reduced-motion guard in `@layer base` already stills the pulse.
 */
export default function WatchesLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <p className="sr-only" role="status">
        Loading your price watches
      </p>

      <div className="flex flex-col gap-3">
        <div className="h-10 w-56 animate-pulse rounded-[12px] bg-tm-hairline" />
        <div className="h-4 w-full max-w-[52ch] animate-pulse rounded-[8px] bg-tm-hairline" />
      </div>

      <div className="h-[62px] animate-pulse rounded-[18px] border-[1.5px] border-tm-border bg-card" />

      <div className="flex flex-col gap-2 rounded-[24px] border border-tm-border bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded-[8px] bg-tm-hairline" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-b border-tm-hairline py-4 last:border-b-0"
          >
            <div className="size-14 animate-pulse rounded-[12px] bg-tm-hairline" />
            <div className="flex flex-col gap-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded-[6px] bg-tm-hairline" />
              <div className="h-3 w-1/3 animate-pulse rounded-[6px] bg-tm-hairline" />
            </div>
            <div className="h-4 w-20 animate-pulse rounded-[6px] bg-tm-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
