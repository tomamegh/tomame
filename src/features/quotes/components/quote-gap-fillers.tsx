"use client";

import { WarningCircle } from "@phosphor-icons/react/ssr";

import type { OriginCountry } from "@/features/orders/types";
import { cn } from "@/lib/utils";

/** Exactly the values `createOrderSchema.origin_country` accepts. */
const COUNTRY_OPTIONS: readonly OriginCountry[] = ["USA", "UK", "CHINA"];

export interface QuoteGapFillersProps {
  /** True when the extraction could not read a price for this listing. */
  priceMissing: boolean;
  /** True when the store's shipping region could not be determined. */
  countryMissing: boolean;
  priceUsd: string;
  onPriceChange: (value: string) => void;
  country: OriginCountry | null;
  onCountryChange: (value: OriginCountry) => void;
}

/**
 * The two things the customer can tell us when the extractor could not.
 *
 * This exists because the extraction pipeline *deliberately* degrades. A store
 * the registry marks `blocked` returns no price on purpose, with a message
 * saying so, and stores outside the registry return no region — both are
 * designed to hand the customer a manual path, not a dead end.
 *
 * The server has always supported it: `estimated_price_usd` is honoured only
 * when the snapshot has no price of its own (`gapFillOverrides`), and any order
 * that leans on it is flagged for admin review. So a customer cannot undercut a
 * price we did read — this input is reachable only when there is nothing to
 * undercut.
 *
 * Rendered only when a gap actually exists; a complete extraction never shows it.
 */
export function QuoteGapFillers({
  priceMissing,
  countryMissing,
  priceUsd,
  onPriceChange,
  country,
  onCountryChange,
}: QuoteGapFillersProps) {
  if (!priceMissing && !countryMissing) return null;

  return (
    <section className="flex flex-col gap-3.5 rounded-[18px] border border-tm-amber bg-tm-amber-bg p-[18px]">
      <p className="flex items-center gap-2 text-sm leading-none font-semibold">
        <WarningCircle
          weight="duotone"
          className="size-[18px] shrink-0 text-tm-amber"
          aria-hidden
        />
        We need one more detail
      </p>

      {priceMissing && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="quote-gap-price"
            className="text-[13px] leading-none font-semibold"
          >
            Item price in USD
          </label>
          <input
            id="quote-gap-price"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max="50000"
            value={priceUsd}
            onChange={(event) => onPriceChange(event.target.value)}
            placeholder="e.g. 129.99"
            className={cn(
              "tm-nums h-11 rounded-[10px] border border-tm-border bg-card px-3 text-[14px] leading-none",
              "placeholder:text-tm-text-3 focus-visible:border-tm-coral focus-visible:outline-none",
            )}
          />
          <p className="text-[12px] leading-[1.4] text-tm-text-2">
            We couldn&apos;t read the price on that page. Enter what the store
            shows and we&apos;ll check it before charging you.
          </p>
        </div>
      )}

      {countryMissing && (
        <div className="flex flex-col gap-2">
          <span id="quote-gap-country" className="text-[13px] leading-none font-semibold">
            Where does this ship from?
          </span>
          <div role="group" aria-labelledby="quote-gap-country" className="flex gap-2">
            {COUNTRY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={country === option}
                onClick={() => onCountryChange(option)}
                className={cn(
                  "h-11 flex-1 rounded-[10px] border bg-card text-[13px] leading-none font-semibold transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none",
                  country === option
                    ? "border-tm-coral text-tm-coral-strong"
                    : "border-tm-border hover:border-tm-coral",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-[12px] leading-[1.4] text-tm-text-2">
            We didn&apos;t recognise this store, so we can&apos;t tell which
            warehouse it reaches. Freight depends on it.
          </p>
        </div>
      )}
    </section>
  );
}
