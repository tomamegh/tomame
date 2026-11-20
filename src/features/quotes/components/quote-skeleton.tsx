import { cn } from "@/lib/utils";

/** The hatch the design uses for an image it does not have yet. */
const BLOCK = "rounded-[14px] bg-muted motion-reduce:animate-none";

/**
 * The loading state, drawn on the SAME grid and at the SAME heights as the
 * quote itself — 72px rail, 460px image, 420px rail on desktop; a 240px gallery
 * under a 36px header row at 390px — so the real screen lands in place instead
 * of shoving the page down as it arrives.
 */
export function QuoteSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-[18px] pb-[92px] lg:gap-[22px] lg:pb-0"
    >
      <span className="sr-only">Loading your landed price…</span>

      {/* The 36px header row at 390px; the breadcrumb from `lg` up. */}
      <div className={cn(BLOCK, "h-9 w-full animate-pulse lg:h-8 lg:max-w-[560px]")} />

      <div className="grid items-start gap-3.5 lg:gap-x-[22px] lg:gap-y-5 lg:grid-cols-[72px_1fr_420px]">
        <div className="hidden flex-col gap-2 lg:flex">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={cn(BLOCK, "size-[72px] animate-pulse rounded-[12px]")}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3.5 lg:gap-5">
          <div
            className={cn(
              "h-[240px] animate-pulse rounded-[22px] bg-muted motion-reduce:animate-none sm:h-[380px] lg:h-[460px] lg:rounded-[24px]",
            )}
          />
          <div className="flex flex-col gap-3.5 lg:gap-2.5">
            <div className={cn(BLOCK, "h-7 w-full animate-pulse")} />
            <div className={cn(BLOCK, "h-7 w-2/3 animate-pulse")} />
            <div className="mt-1 flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={cn(BLOCK, "h-9 w-28 animate-pulse rounded-full")}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {/* The price card: overline, figure, rate lock, breakdown line, quantity. */}
          <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card p-4 sm:p-5 lg:p-[22px]">
            <div className={cn(BLOCK, "h-3 w-28 animate-pulse rounded-full")} />
            <div className={cn(BLOCK, "h-9 w-48 animate-pulse lg:h-11")} />
            <div className={cn(BLOCK, "h-3.5 w-56 animate-pulse rounded-full")} />
            <div className={cn(BLOCK, "h-11 w-full animate-pulse rounded-[12px] lg:h-[150px]")} />
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className={cn(BLOCK, "h-4 w-20 animate-pulse rounded-full")} />
              <div className={cn(BLOCK, "h-11 w-[120px] animate-pulse rounded-full")} />
            </div>
            <div className={cn(BLOCK, "hidden h-[52px] w-full animate-pulse lg:block")} />
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={cn(
                  BLOCK,
                  "h-[92px] flex-1 animate-pulse rounded-[16px]",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
