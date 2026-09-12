import { cn } from "@/lib/utils";

/** The hatch the design uses for an image it does not have yet. */
const BLOCK = "rounded-[14px] bg-tm-hairline";

/**
 * The loading state, drawn on the SAME grid and at the SAME heights as the
 * quote itself — 72px rail, 460px image, 420px rail — so the real screen lands
 * in place instead of shoving the page down as it arrives.
 */
export function QuoteSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-[22px]"
    >
      <span className="sr-only">Loading your landed price…</span>

      <div className={cn(BLOCK, "h-8 w-full max-w-[560px] animate-pulse")} />

      <div className="grid items-start gap-[22px] lg:grid-cols-[72px_1fr_420px]">
        <div className="hidden flex-col gap-2 lg:flex">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={cn(BLOCK, "size-[72px] animate-pulse rounded-[12px]")}
            />
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <div
            className={cn(
              "h-[300px] animate-pulse rounded-[24px] bg-tm-hairline sm:h-[380px] lg:h-[460px]",
            )}
          />
          <div className="flex flex-col gap-2.5">
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
          <div className="h-[420px] animate-pulse rounded-[24px] bg-tm-hairline" />
          <div className="flex gap-2.5">
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
