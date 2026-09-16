import type { Metadata } from "next";
import Link from "next/link";
import { Boat, CarProfile } from "@phosphor-icons/react/ssr";

import { CarGrid, accraDay } from "@/features/cars/components";

import {
  attachCovers,
  listLiveCarEnquiriesByListing,
  listPublishedCars,
} from "@/features/cars/services/cars.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { logger } from "@/lib/logger";

export const metadata: Metadata = {
  title: "Cars en route to Ghana · Tomame",
  description:
    "Vehicles we have already bought and put on a ship, priced landed in Tema with duty and clearing paid.",
};

/**
 * How many listings the forecourt draws.
 *
 * Sixty, which is far more cars than we will have on the water at once and
 * still a ceiling. The covers are one batched read (`attachCovers`
 * issues one indexed `car_photos` query each), so an unbounded page would grow
 * its own cost with the table; the number is here rather than inline so the
 * bound is visible when that cost is fixed.
 */
const CARS_INDEX_LIMIT = 60;

/**
 * The forecourt: every car we have on a ship.
 *
 * PUBLIC, AND THAT IS THE POINT. `/app/cars` is in `publicRoutes` in
 * `src/lib/supabase/proxy.ts`. A car listing is the flagship advert — a buyer
 * sends a link to one vehicle to somebody who has never heard of Tomame — and a
 * login wall in front of the photographs is the feature failing at its one job.
 * `/app/products` is public for the same reason, and the photo route
 * (`/api/cars/photos/:id`) is public too and re-checks `is_published` per
 * request, so the picture and the page agree.
 *
 * BUYING AND NEGOTIATING ARE STILL GATED, just not here.
 * `/api/cars/checkout` and `/api/cars/enquiries` each do their own
 * `requireAuth()`, and the buttons answer a 401 by sending the visitor to sign
 * in with this page as the return address. Sign-in is asked for at the moment
 * somebody acts, not at the moment they look.
 *
 * A FAILED READ COSTS THE GRID, NOT THE PAGE. Neither this segment nor `/app`
 * defines an `error.tsx`, so an uncaught throw escalates to the root
 * `global-error.tsx` and replaces the whole application shell — no nav, no tab
 * bar. `ProductsPage` makes the same catch for the same reason.
 *
 * A Server Component. The action row on each card is the only client island.
 */
export default async function CarsPage() {
  let cars: Awaited<ReturnType<typeof attachCovers>> = [];
  let total = 0;
  let readFailed = false;

  try {
    const published = await listPublishedCars({ limit: CARS_INDEX_LIMIT });
    total = published.total;
    cars = await attachCovers(published.cars);
  } catch (error) {
    readFailed = true;
    logger.error("car listings unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /*
    Which of these has this viewer already asked about? One read for the whole
    grid, so a card whose enquiry is live says so instead of offering a button
    the unique index will refuse. Signed out it costs no query at all.
  */
  const viewer = await getAuthenticatedUser();
  const enquiries = await listLiveCarEnquiriesByListing(viewer?.id ?? null);

  // One day for the whole render, so every ribbon in the grid agrees about
  // which cars have landed. Accra is GMT year-round.
  const today = accraDay(new Date());

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="tm-up flex min-w-0 flex-col gap-3">
        <span className="flex w-fit items-center gap-2 rounded-full bg-tm-tint px-3 py-1.5 text-[12px] leading-none font-bold text-tm-coral-strong">
          <Boat weight="duotone" className="size-4" aria-hidden />
          On the water now
        </span>

        <h1 className="max-w-[16ch] font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[42px]">
          Cars en route to Ghana
        </h1>

        <p className="max-w-[62ch] text-[15px] leading-[1.5] font-medium text-tm-text-2">
          Vehicles we have already bought and put on a ship. Where a price is
          shown it is the car landed in Tema with ocean freight, insurance,
          Ghana duty and clearing all paid. Registration and plates are yours
          to do. Some are open to offers and some we will price for you on
          request.
        </p>
      </header>

      {readFailed && (
        <EmptyPanel
          heading="We cannot reach the listings right now"
          body="This is on us, not on your connection. Try again in a minute and the cars will be back."
        />
      )}

      {!readFailed && cars.length === 0 && (
        <EmptyPanel
          heading="Nothing on the water right now"
          body="Every car we ship is bought to order and sold before the next one is booked, so this shelf empties between sailings. Tell us what you are after and we will look for it on the next auction."
          action={{ href: "/contact", label: "Tell us what you want" }}
        />
      )}

      {!readFailed && cars.length > 0 && (
        <section
          aria-labelledby="cars-results-heading"
          className="tm-up flex min-w-0 flex-col gap-3.5 [animation-delay:0.05s]"
        >
          <h2
            id="cars-results-heading"
            className="font-display text-[19px] leading-none font-bold"
          >
            {total === 1 ? "1 car listed" : `${total} cars listed`}
          </h2>

          <CarGrid cars={cars} today={today} enquiries={enquiries} />

          {total > cars.length && (
            <p className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-3">
              Showing the first {cars.length}.{" "}
              <Link
                href="/contact"
                className="font-semibold text-tm-coral underline-offset-2 hover:underline"
              >
                Ask us
              </Link>{" "}
              about anything you do not see here.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * The shelf with nothing on it, and the shelf we could not read.
 *
 * TWO STATES, ONE PANEL, DIFFERENT WORDS. They look the same and mean opposite
 * things — "there are no cars" versus "we could not find out whether there are
 * cars" — so the copy is the caller's and the panel only draws it. What neither
 * of them does is show a sample vehicle: a made-up car is a made-up six-figure
 * price attached to a photograph of something that does not exist.
 */
function EmptyPanel({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="tm-up flex min-w-0 flex-col items-start gap-3 rounded-[20px] border border-tm-border bg-card p-6 [animation-delay:0.05s]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-tm-pill-bg text-tm-text-3">
        <CarProfile weight="duotone" className="size-6" aria-hidden />
      </span>
      <h2 className="font-display text-[17px] leading-tight font-bold">{heading}</h2>
      <p className="max-w-[56ch] text-[13.5px] leading-[1.5] font-medium text-tm-text-2">
        {body}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-11 items-center rounded-[14px] border-[1.5px] border-tm-border bg-card px-4 text-[14px] leading-none font-bold text-tm-ink transition-colors hover:border-tm-coral/40 hover:bg-tm-tint focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}
