import { Info } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { formatPesewas, priceBreakdownRows } from "../format";
import type { CarListingView } from "../types";

export interface CarLandedCostCardProps {
  car: CarListingView;
  className?: string;
}

/**
 * What the price is made of: the vehicle, the crossing, Ghana's customs, and us.
 *
 * DRAWN ONLY WHEN ALL FOUR COMPONENTS EXIST, and that is the entire reason this
 * is a separate component rather than four rows inside the page. Every
 * component column in migration 067 is nullable, so a listing can carry a total
 * with only two of its four parts filled in. A card showing "Vehicle
 * GH₵120,000 / Ocean freight and insurance GH₵18,000" beside a landed total of
 * GH₵185,000 does not read as "we have not entered the rest" — it reads as
 * though duty and our fee are GH₵47,000 and we declined to say which is which,
 * or worse, as though the missing lines are zero and the total is wrong.
 *
 * The rule is enforced in three places and this is the last of them:
 * `car_listings_breakdown_sums_to_total` refuses a COMPLETE set that disagrees
 * with the total, `toCarListingView` refuses to build a breakdown from an
 * INCOMPLETE set (so `car.breakdown` is null, not partial), and
 * `priceBreakdownRows` returns an empty array when either the breakdown or the
 * total is missing. Nothing here invents a residual line to make the arithmetic
 * work, and nothing here subtracts the parts we happen to have from the total.
 *
 * REGISTRATION AND PLATES ARE SAID PLAINLY, in the card rather than in a
 * footnote elsewhere. "Landed in Tema, duty and clearing included" is a strong
 * claim, and the first question it raises is whether the car can be driven. It
 * cannot, not yet — DVLA registration and plates are the customer's, and a
 * customer who learns that after paying has been misled by omission.
 *
 * A Server Component; `formatPesewas` is the feature's own money formatter and
 * the only place pesewas become cedis.
 */
export function CarLandedCostCard({ car, className }: CarLandedCostCardProps) {
  const rows = priceBreakdownRows(car.breakdown, car.price_pesewas);
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="car-landed-cost-heading"
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[20px] border border-tm-border bg-card p-5",
        className,
      )}
    >
      <header className="flex min-w-0 flex-col gap-1">
        <h2
          id="car-landed-cost-heading"
          className="font-display text-[17px] leading-none font-bold"
        >
          What the price is made of
        </h2>
        <p className="max-w-[52ch] text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
          The whole figure, broken out. Nothing is added at the port.
        </p>
      </header>

      <dl className="flex min-w-0 flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              "flex min-w-0 items-baseline justify-between gap-4 py-2.5",
              row.isTotal
                ? "mt-1 border-t-[1.5px] border-tm-border pt-3"
                : "border-b border-tm-hairline",
            )}
          >
            <dt
              className={cn(
                "min-w-0 leading-[1.35]",
                row.isTotal
                  ? "text-[14px] font-bold text-tm-ink"
                  : "text-[13px] font-medium text-tm-text-2",
              )}
            >
              {row.label}
            </dt>
            <dd
              className={cn(
                "tm-nums shrink-0 leading-none",
                row.isTotal
                  ? "text-[18px] font-bold text-tm-ink"
                  : "text-[13.5px] font-semibold text-tm-ink",
              )}
            >
              {formatPesewas(row.pesewas)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="flex min-w-0 items-start gap-2 rounded-[14px] bg-tm-pill-bg px-3.5 py-3 text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
        <Info weight="duotone" className="mt-0.5 size-4 shrink-0 text-tm-text-3" aria-hidden />
        <span className="min-w-0">
          Registration and plates are not included. The figure above lands the
          car in Tema with duty and clearing paid; putting it on the road with
          the DVLA is yours to do.
        </span>
      </p>
    </section>
  );
}
