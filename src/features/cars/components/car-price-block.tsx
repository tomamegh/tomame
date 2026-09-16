import { CAR_PRICE_STATES } from "@/config/constants";
import { cn } from "@/lib/utils";
import { priceLabel } from "../format";
import type { CarListingView } from "../types";

export interface CarPriceBlockProps {
  listing: Pick<CarListingView, "price_state" | "price_pesewas">;
  /** `card` is the grid tile; `hero` is the detail page's headline. */
  size?: "card" | "hero";
  className?: string;
}

/**
 * The headline price, in all three of its states.
 *
 * WHY IT IS A COMPONENT AND NOT THREE LINES OF JSX IN EACH CALLER. There are
 * four places a car's price is printed — the index card, the Home rail card,
 * the detail page and the phone action bar — and the rule that must hold in
 * every one of them is that an `on_request` listing NEVER PRINTS A FIGURE. The
 * database makes "on request but priced" unrepresentable
 * (`car_listings_price_state_has_price`) and `priceLabel` is total over the
 * three states rather than a chain of `??`, so the "no price" case cannot fall
 * through to a stale number. Four hand-written copies of that would be four
 * chances to reintroduce the `??`.
 *
 * "Price on request" IS NOT STYLED AS A PRICE — it is smaller, and it takes the
 * secondary ink rather than the heading ink. That is the whole reason
 * `priceLabel` returns `isAmount` alongside the text rather than just a string:
 * a sentence set in 20px bold beside real prices reads as one, and a customer
 * scanning a grid should be able to tell at a glance which cars have a number
 * without reading the words.
 *
 * A Server Component. It prints what the server already decided.
 */
export function CarPriceBlock({
  listing,
  size = "card",
  className,
}: CarPriceBlockProps) {
  const label = priceLabel(listing);
  const hero = size === "hero";

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <span
          className={cn(
            "min-w-0 leading-none",
            label.isAmount
              ? cn("tm-nums font-bold text-tm-ink", hero ? "text-[30px] sm:text-[34px]" : "text-[20px]")
              : cn("font-bold text-tm-text-2", hero ? "text-[22px]" : "text-[16px]"),
          )}
        >
          {label.text}
        </span>

        {listing.price_state === CAR_PRICE_STATES.NEGOTIABLE && (
          <span
            className={cn(
              "shrink-0 rounded-full bg-tm-tint px-2 py-1 leading-none font-bold text-tm-coral-strong",
              hero ? "text-[12px]" : "text-[11px]",
            )}
          >
            Negotiable
          </span>
        )}
      </p>

      {label.note && (
        <p
          className={cn(
            "max-w-[46ch] leading-[1.4] font-medium text-tm-text-3",
            hero ? "text-[13px]" : "text-[11.5px]",
          )}
        >
          {label.note}
        </p>
      )}
    </div>
  );
}
