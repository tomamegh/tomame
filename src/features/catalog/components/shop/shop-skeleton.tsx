import { cn } from "@/lib/utils";

/**
 * What the shop looks like while it answers: the same boxes in the same places,
 * so the page does not jump when the real one lands. Shown by the Suspense
 * boundary the route keys by address, i.e. on every filter, sort and page.
 */
export function ShopSkeleton({ grouped }: { grouped: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex min-w-0 flex-col gap-5"
    >
      <span className="sr-only">Loading products</span>
      <div className="flex flex-col gap-2">
        <Bone className="h-8 w-64 max-w-full sm:h-9" />
        <Bone className="h-4 w-full max-w-[520px]" />
      </div>
      <Bone className="h-[52px] w-full rounded-[14px]" />
      <div className="flex gap-2.5 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone
            key={i}
            className="aspect-[4/5] w-[124px] shrink-0 rounded-[18px] md:aspect-[4/3] md:w-[160px]"
          />
        ))}
      </div>
      <div className="flex items-center justify-between border-y border-tm-border py-3">
        <Bone className="h-10 w-28 rounded-[12px]" />
        <Bone className="h-10 w-44 rounded-[12px]" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-3 lg:flex">
          {Array.from({ length: 10 }, (_, i) => (
            <Bone
              key={i}
              className={cn("h-5", i % 4 === 0 ? "w-24" : "w-full")}
            />
          ))}
        </div>
        <ShopResultsSkeleton grouped={grouped} />
      </div>
    </div>
  );
}

/** Just the results area: the initial load's fallback, and the pending state between presses. */
export function ShopResultsSkeleton({ grouped }: { grouped: boolean }) {
  return grouped ? (
    <div className="flex min-w-0 flex-col gap-9">
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="flex min-w-0 flex-col gap-3">
          <Bone className="h-6 w-48" />
          <div className="flex gap-3 overflow-hidden lg:grid lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <CardBone
                key={i}
                className="w-[168px] shrink-0 sm:w-[208px] lg:w-auto"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <CardBone key={i} />
      ))}
    </div>
  );
}

function CardBone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border border-tm-border bg-card p-3",
        className,
      )}
    >
      <Bone className="aspect-square w-full rounded-[14px]" />
      <Bone className="h-3 w-16" />
      <Bone className="h-4 w-full" />
      <Bone className="h-5 w-24" />
    </div>
  );
}

function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-tm-pill-bg", className)}
    />
  );
}
