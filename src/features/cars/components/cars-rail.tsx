import Link from "next/link";
import { ArrowRight, Boat } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { CarCard } from "./car-card";
import type { CarWithCover } from "../services/cars.service";

export interface CarsRailProps {
  /**
   * The published cars Home is showing, already carrying their covers. Empty
   * renders NOTHING — see below.
   */
  cars: readonly CarWithCover[];
  /** How many published listings exist in total, so the link can say. */
  total: number;
  /** The render's ISO day, so every ribbon on the row agrees about what has landed. */
  today: string;
  className?: string;
}

/**
 * "Cars en route to Ghana" — the shelf that sits under the hero on `/app`.
 *
 * IT RENDERS NOTHING AT ALL WHEN THERE ARE NO PUBLISHED CARS. Not an empty
 * shelf, not a "cars coming soon" card, and above all not a sample vehicle.
 * `DealsShelf` returns null on an empty catalogue for the same reason and it is
 * worth restating here, because a car is the most expensive thing on this
 * site: a made-up product on a price screen is a made-up price, and a made-up
 * CAR is a made-up six-figure price attached to a photograph of a vehicle that
 * does not exist. The shelf appears the moment an admin publishes one and not
 * a moment before.
 *
 * WHY IT SITS THIRD, UNDER `EntryDoors` AND ABOVE `DealsShelf`. The hero asks
 * "what would you like landed in Accra?" and the three doors answer it for
 * anything that fits in a box. A car does not fit in a box and does not come
 * through any of those doors — it is already bought, already on a ship, and the
 * only thing a customer does with it is look and decide. That makes it the
 * first thing on the page that is not a way of asking us for something, which
 * is why it goes above the catalogue shelf rather than below it.
 *
 * WHY IT SCROLLS SIDEWAYS AT EVERY WIDTH. Same shape as `department-row.tsx`:
 * fixed-width tiles in an `overflow-x-auto` box is the only arrangement that
 * cannot widen the page, and a wrapping grid of cars on Home would become a
 * second forecourt competing with `/app/cars`, which is the screen built for
 * the whole list.
 *
 * `overscroll-x-contain` IS NOT DECORATION. Without it, a rightward flick with
 * the track already at scroll-left 0 hands the gesture to the page, and in the
 * installed PWA that is iOS's back-swipe: a customer browsing cars is thrown
 * off Home entirely.
 *
 * A Server Component. The cards' action rows are the only client islands.
 */
export function CarsRail({ cars, total, today, className }: CarsRailProps) {
  if (cars.length === 0) return null;

  return (
    <section
      aria-labelledby="home-cars-heading"
      className={cn("tm-up flex min-w-0 flex-col gap-4 [animation-delay:0.12s]", className)}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tm-tint text-tm-coral">
              <Boat weight="duotone" className="size-[19px]" aria-hidden />
            </span>
            <h2
              id="home-cars-heading"
              className="font-display text-[19px] leading-none font-bold sm:text-[21px]"
            >
              Cars en route to Ghana
            </h2>
          </div>
          <p className="max-w-[62ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">
            Vehicles we have already bought and put on a ship. Every cedi figure
            is the car landed in Tema with duty and clearing paid, and registration
            and plates are yours to do.
          </p>
        </div>

        <Link
          href="/app/cars"
          className="inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {/* The total is a real count of published listings, so it can be
              said. It is not the catalogue's "how much we scraped" figure,
              which `DealsShelf` deliberately stopped printing. */}
          {total > cars.length ? `See all ${total} cars` : "See all cars"}
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      <ul className="-mx-1 flex min-w-0 snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cars.map((entry) => (
          <CarCard key={entry.car.id} entry={entry} today={today} variant="rail" />
        ))}
      </ul>
    </section>
  );
}
