"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { shopHref, type ShopState } from "../../shop-params";

/**
 * A custom GH₵ range: two whole-cedi bounds and a Go button.
 *
 * A client island only so that submitting builds the address with `shopHref`
 * (page back to one, every other filter kept, empty bounds left out) instead of
 * a GET form writing `min=&max=` and dropping the rest of the state. Without
 * JavaScript it degrades to a plain GET of the two bounds, which still parses.
 * The bounds are what the customer asked to see; nothing is calculated here.
 */
export function ShopPriceRangeForm({
  state,
  range,
  idPrefix,
  className,
}: {
  state: ShopState;
  /** Priced floor and ceiling under the other filters, as placeholders. */
  range: { min: number; max: number } | null;
  idPrefix: string;
  className?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [min, setMin] = useState(
    state.minGhs != null ? String(state.minGhs) : "",
  );
  const [max, setMax] = useState(
    state.maxGhs != null ? String(state.maxGhs) : "",
  );

  const toBound = (raw: string) => {
    const n = Math.round(Number(raw.replace(/[^\d.]/g, "")));
    return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <form
      action="/app/orders/new"
      method="get"
      data-shop-form
      className={cn("flex min-w-0 flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        let lo = toBound(min);
        let hi = toBound(max);
        if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
        router.push(shopHref(state, { minGhs: lo, maxGhs: hi }), {
          scroll: false,
        });
      }}
    >
      <input type="hidden" name="mode" value="browse" />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
        <label
          className="flex min-w-0 flex-col gap-1"
          htmlFor={`${idPrefix}-${uid}-min`}
        >
          <span className="text-[11.5px] leading-none font-semibold text-tm-text-3">
            Min GH₵
          </span>
          <input
            id={`${idPrefix}-${uid}-min`}
            name="min"
            inputMode="numeric"
            autoComplete="off"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder={range ? String(range.min) : "0"}
            className="h-10 w-full min-w-0 rounded-[10px] border border-tm-border bg-card px-2.5 text-base font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral focus:outline-none sm:text-[13.5px]"
          />
        </label>
        <label
          className="flex min-w-0 flex-col gap-1"
          htmlFor={`${idPrefix}-${uid}-max`}
        >
          <span className="text-[11.5px] leading-none font-semibold text-tm-text-3">
            Max GH₵
          </span>
          <input
            id={`${idPrefix}-${uid}-max`}
            name="max"
            inputMode="numeric"
            autoComplete="off"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={range ? String(range.max) : "Any"}
            className="h-10 w-full min-w-0 rounded-[10px] border border-tm-border bg-card px-2.5 text-base font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral focus:outline-none sm:text-[13.5px]"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-[10px] border-[1.5px] border-tm-border bg-card px-3 text-[13px] font-semibold text-tm-ink transition-colors hover:border-tm-coral hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
        >
          Go
        </button>
      </div>
    </form>
  );
}
