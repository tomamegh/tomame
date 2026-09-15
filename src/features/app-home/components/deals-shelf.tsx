import Link from "next/link";
import { ArrowRight, FireSimple } from "@phosphor-icons/react/ssr";

import { CatalogResultsGrid } from "@/features/catalog/components/catalog-results";
import { DepartmentRow } from "@/features/catalog/components/department-row";
import { cn } from "@/lib/utils";
import type { HomeDeals } from "../types";

export interface DealsShelfProps {
  /**
   * Built by `buildDeals()` from the pre-scraped catalogue. Null when nothing
   * we hold could be priced — the section then renders nothing at all rather
   * than an empty shelf or, worse, a sample one.
   */
  deals: HomeDeals | null;
  /**
   * Everything the pre-scraped catalogue holds.
   *
   * IT IS NO LONGER A NUMBER THIS SHELF PRINTS. The browse link used to read
   * "Browse all 1,284", and that figure was the size of our SCRAPE dressed up
   * as the size of the shop: Tomame will buy any listing a customer pastes from
   * any store we support, so a four-figure catalogue made the offer look
   * bounded and a two-figure one made it look empty. Whichever way it moved, it
   * moved the wrong way.
   *
   * The prop stays on the interface because `/app` still has the figure and
   * because it remains the honest signal of whether there is anything behind
   * the link at all — but it is now a signal, not a value, and nothing on this
   * screen renders it.
   */
  catalogueCount: number;
  /** One clock for the whole render, so every card agrees on how old a price is. */
  now: Date;
  className?: string;
}

/**
 * "Hot right now" — the shop half of the signed-in Home screen.
 *
 * WHY IT IS HERE AND WHY IT IS SECOND. Kelvin, on the signed-in Home: "we are
 * helping users shop and once logged in that is what the app should help the
 * user do". Home used to open on a lane advert ("Shipping from the USA"), which
 * tells somebody who has already signed up a thing they learned before they
 * signed up. This is what replaced it: real products, already read, with the
 * whole cedi total already worked out.
 *
 * NOTHING HERE IS INVENTED AND NOTHING HERE IS CALCULATED. Every card is a
 * `catalog_products` row; every `total_ghs` was struck by the pricing engine
 * server-side in `listCatalogDeals`, for quantity one, at today's rate. The
 * cards only choose how to print it. There is no placeholder state and no
 * sample product, because a made-up product on a price screen is a made-up
 * price.
 *
 * WHAT THE HEADING IS ALLOWED TO CLAIM. "Hot" is `review_count` — the only
 * popularity signal the scraper stores — taken a couple at a time from each
 * shelf so one scraped query cannot fill the row, and then sorted on the
 * landed cedi total. The sub-line says exactly that and nothing more. It does
 * NOT say "deals", "discount", "sale" or "was/now": the catalogue holds one
 * price per listing and no history, so there is no saving here to claim.
 */
export function DealsShelf({ deals, now, className }: DealsShelfProps) {
  if (!deals) return null;

  return (
    <section
      aria-labelledby="home-deals-heading"
      className={cn("tm-up flex min-w-0 flex-col gap-4 [animation-delay:0.18s]", className)}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tm-tint text-tm-coral">
              <FireSimple weight="duotone" className="size-[19px]" aria-hidden />
            </span>
            <h2
              id="home-deals-heading"
              className="font-display text-[19px] leading-none font-bold sm:text-[21px]"
            >
              Hot right now
            </h2>
          </div>
          <p className="max-w-[62ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">
            The most-reviewed products from each shelf we hold, cheapest landed
            total first. Every figure is the whole cedi price (item, US sales
            tax, our fee and freight), worked out when we last read the
            listing. Open one and we price it again live before you pay.
          </p>
        </div>

        <Link
          href={deals.browseHref}
          className="inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Browse everything we&rsquo;ve priced
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      {/*
        The same row the browse screen draws, from the same component. Home has
        no open shelf to mark, so no department is active here: pressing one is
        a navigation into browse, where it then shows as open. `count` is read
        off `deals.categories` and deliberately not passed — the row prints no
        figures, which is the whole reason it replaced the badge pills.
      */}
      <DepartmentRow
        departments={deals.categories.map((category) => ({
          label: category.label,
          href: category.href,
        }))}
      />

      <CatalogResultsGrid results={deals.products} now={now} />
    </section>
  );
}
