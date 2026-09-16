import { cn } from "@/lib/utils";
import { carTitle } from "../format";
import type { CarListingView } from "../types";
import { CarActions, type StandingCarEnquiry } from "./car-actions";
import { CarPriceBlock } from "./car-price-block";

export interface CarActionBarProps {
  car: CarListingView;
  /** The viewer's live enquiry on this car, so the phone bar says the same thing the desktop rail does. */
  standingEnquiry?: StandingCarEnquiry | null;
  className?: string;
}

/**
 * The phone's action bar: the price, then the thing that acts on it.
 *
 * STICKY, NOT FIXED — the opposite of `BagPayBar`, and for a reason that is
 * about the bottom tab bar rather than about this screen. `/app/bag` is in
 * `MOBILE_ACTION_BAR_ROUTES` (`components/layout/app/links.ts`), so the tab bar
 * STANDS DOWN there and a fixed bar can own the bottom edge outright. `/app/cars`
 * is not in that list and must not be: a car listing is a page a signed-out
 * visitor reaches from a link somebody sent them, and removing the app's
 * navigation from it would strand them on it.
 *
 * So there are two bars on a phone here, and this one has to sit ON TOP of the
 * other. `tm-above-tab-bar` is the named utility in `globals.css` written for
 * exactly that: `position: sticky` with `bottom: calc(84px + env(safe-area-inset-bottom))`,
 * the same sum `tm-clear-tab-bar` reserves, and `position: static` from `lg`.
 * IT MUST BE THAT NAMED UTILITY AND NOT AN ARBITRARY CLASS: `cn()`
 * (tailwind-merge) silently drops `bottom-[calc(84px_+_env(safe-area-inset-bottom))]`
 * from the rendered className, and the bar then measures 0 and sits behind the
 * tab bar with no error anywhere.
 *
 * Being sticky also means it RESERVES ITS OWN SPACE in normal flow, so the page
 * needs no extra bottom padding for it — the layout's `tm-clear-tab-bar` on
 * `<main>` is already clearing the only fixed thing on the screen.
 *
 * The negative margins cancel `<main>`'s horizontal padding so the bar's rule
 * runs edge to edge, and they track it at both breakpoints (`px-5`, then
 * `md:px-8`) — a bar that is inset by 20px on a tablet is a bar that looks like
 * a mistake.
 *
 * TWO ROWS, NOT ONE. A negotiable car has two actions, and two buttons plus a
 * five-figure price on one 390px line leaves each of them about 110px. The
 * price takes its own line, the same shape `BagPayBar` uses for its lock
 * countdown.
 */
export function CarActionBar({
  car,
  standingEnquiry = null,
  className,
}: CarActionBarProps) {
  return (
    <div
      className={cn(
        "tm-above-tab-bar z-30 -mx-5 mt-2 border-t border-tm-border bg-card/95 px-5 pt-3 pb-3 backdrop-blur-[8px] md:-mx-8 md:px-8 lg:hidden",
        className,
      )}
    >
      <CarPriceBlock listing={car} className="pb-2.5" />
      <CarActions
        standingEnquiry={standingEnquiry}
        carListingId={car.id}
        slug={car.slug}
        title={carTitle(car)}
        priceState={car.price_state}
        pricePesewas={car.price_pesewas}
      />
    </div>
  );
}
