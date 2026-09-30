/**
 * Segment loading UI for every `/app` screen without its own (Home, orders,
 * the quote flow, the bag, account). Rendered inside the app layout, so the
 * header and nav stay put and only the content area waits.
 *
 * Blank surfaces only: nothing here can be mistaken for a product or a price.
 * The reduced-motion guard in `@layer base` stills the pulse.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <p className="sr-only" role="status">
        Loading
      </p>

      <div className="flex flex-col gap-3">
        <div className="h-10 w-56 max-w-full animate-pulse rounded-[12px] bg-tm-hairline" />
        <div className="h-4 w-full max-w-[52ch] animate-pulse rounded-[8px] bg-tm-hairline" />
      </div>

      <div className="flex flex-col gap-2 rounded-[24px] border border-tm-border bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded-[8px] bg-tm-hairline" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-b border-tm-hairline py-4 last:border-b-0"
          >
            <div className="size-14 animate-pulse rounded-[12px] bg-tm-hairline" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded-[6px] bg-tm-hairline" />
              <div className="h-3 w-1/3 animate-pulse rounded-[6px] bg-tm-hairline" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded-[6px] bg-tm-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
