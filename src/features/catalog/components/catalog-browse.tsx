import Link from "next/link";
import {
  ArrowRight,
  LinkSimple,
  MagnifyingGlass,
  Storefront,
  X,
} from "@phosphor-icons/react/ssr";

import { CATALOG_SEARCH } from "@/config/catalog";
import { cn } from "@/lib/utils";

/**
 * The pieces of the old browse panel the shop still uses: the search box over
 * the catalogue and the two whole-catalogue states (nothing priced yet, and the
 * read failed). The panel itself — one open shelf, cheapest first, "show more"
 * — was replaced by the filterable, paged shop in `./shop/shop-view.tsx`.
 */

/**
 * The search box over the catalogue.
 *
 * A plain GET form, like the one it replaces on `/app/products`: submitting
 * navigates, the server re-renders, and the term stays in the URL. That is what
 * makes a search shareable, what makes the back button honest, and why this
 * whole panel is still a server component.
 *
 * `mode` rides along in a hidden field because a GET form REPLACES the query
 * string wholesale — without it, searching would drop the customer back onto the
 * paste half of the screen. `category` deliberately does NOT ride along: a new
 * search starts over the whole catalogue, and the pills are right there to
 * narrow it again.
 */
export function CatalogBrowseSearchField({
  defaultValue,
  clearHref,
}: {
  defaultValue: string;
  clearHref: string | null;
}) {
  return (
    <form
      action="/app/orders/new"
      method="get"
      role="search"
      className="flex w-full min-w-0 flex-col gap-2.5 sm:flex-row"
    >
      <input type="hidden" name="mode" value="browse" />
      <label htmlFor="catalog-browse-search" className="sr-only">
        Search products we have already priced
      </label>

      {/*
        `sm:flex-1`, never `flex-1`. Below `sm` this is a column, and in a column
        `flex: 1 1 0%` flexes the box's HEIGHT: the basis of 0 beats the fixed
        height and the field collapses to the height of its placeholder. Same
        trap the paste box fell into. 16px text on a phone, because iOS zooms the
        page into any field smaller than that on focus.
      */}
      <div className="relative flex min-h-[52px] min-w-0 items-center sm:h-[52px] sm:min-h-0 sm:flex-1">
        <MagnifyingGlass
          weight="bold"
          className="pointer-events-none absolute left-4 size-[18px] text-tm-text-3"
          aria-hidden
        />
        <input
          id="catalog-browse-search"
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoComplete="off"
          maxLength={CATALOG_SEARCH.maxQueryLength}
          placeholder="wireless earbuds, air fryer, laptop stand"
          className={cn(
            "h-full min-h-[52px] w-full min-w-0 rounded-[14px] border border-tm-border bg-card pr-4 pl-11",
            "text-base font-medium text-tm-ink placeholder:text-tm-text-3 sm:text-[15px]",
            "focus:border-tm-coral focus:outline-none",
          )}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="submit"
          className="tm-cta-gradient inline-flex h-[52px] flex-1 items-center justify-center rounded-[14px] px-6 text-[15px] leading-none font-bold text-white focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-none"
        >
          Search
        </button>

        {clearHref && (
          <Link
            href={clearHref}
            className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border border-tm-border bg-card px-4 text-[13.5px] leading-none font-semibold text-tm-text-2 transition-colors hover:border-tm-coral/30 hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X weight="bold" className="size-3.5" aria-hidden />
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

/**
 * Nothing scraped at all. No sample shelves and no sample products: an invented
 * product on a price screen is an invented price.
 */
export function CatalogBrowseEmpty({ pasteHref }: { pasteHref: string }) {
  return (
    <section className="tm-up flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center [animation-delay:0.08s] [animation-duration:0.5s]">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <Storefront weight="duotone" className="size-7" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] leading-[1.2] font-bold">
          Nothing priced up yet
        </h2>
        <p className="mx-auto max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          We have not read and priced any products ahead of time yet. That
          changes nothing about what we can buy: paste the link to whatever you
          want and we will price that exact item, usually in under a minute.
        </p>
      </div>

      <BrowseFooterLink href={pasteHref} label="Paste a product link" icon="link" />
    </section>
  );
}

/**
 * The read failed. Deliberately not phrased as an empty shelf: a customer told
 * "nothing here" when the database blinked stops looking for something we hold.
 */
export function CatalogBrowseUnavailable({ pasteHref }: { pasteHref: string }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <MagnifyingGlass weight="duotone" className="size-7" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] leading-[1.2] font-bold">
          We could not load that category
        </h2>
        <p className="mx-auto max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Something on our side is not answering. Try again in a moment, or paste
          the link to the product you want and we will price that one directly.
        </p>
      </div>

      <BrowseFooterLink href={pasteHref} label="Paste a product link" icon="link" />
    </section>
  );
}

function BrowseFooterLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "link" | "arrow";
}) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {icon === "link" ? (
        <LinkSimple weight="bold" className="size-3.5" aria-hidden />
      ) : (
        <ArrowRight weight="bold" className="size-3.5" aria-hidden />
      )}
      {label}
    </Link>
  );
}
