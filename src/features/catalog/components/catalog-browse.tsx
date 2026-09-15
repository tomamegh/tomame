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
import type { CatalogProduct } from "../types";
import { CatalogResultsGrid } from "./catalog-results";
import { DepartmentRow } from "./department-row";

/**
 * Browsing and searching the pre-priced catalogue, grouped by the categories it
 * actually holds.
 *
 * This is the half of the catalogue a customer can reach with nothing in their
 * hands. The categories are derived from the products themselves, so there is no
 * list of shelves here that the data does not fill: an empty catalogue says so
 * in one sentence rather than offering eight dead shelves.
 *
 * IT SEARCHES NOW TOO. It used to only browse, and the only search over the same
 * products lived on another screen behind a footnote (Kelvin, 2026-09-14: "there
 * is no search button... a user will not painfully go through all the items,
 * searching is better and maintain the category breakdown"). So the box is here,
 * the departments stayed, and the two compose: a department pressed during a
 * search narrows the search rather than discarding it.
 *
 * ONE SHELF IS OPEN AT A TIME, and that is a cost decision rather than a taste
 * one. Every total on a card is struck live by the pricing engine when the page
 * renders, and the engine's inputs are loaded once per read. Opening every
 * category at once would multiply that by the number of shelves to show four
 * products from each. The department row shows the whole shape of the catalogue;
 * the grid shows the shelf that is open.
 *
 * Nothing here calculates money. `total_ghs` arrives already struck server
 * side, and the card refuses to print a figure the engine declined to give.
 */

export interface CatalogBrowseCategory {
  category: string;
  /**
   * How many products we hold on that shelf.
   *
   * NOT PRINTED. It is what the browse screen uses to drop a shelf that holds
   * nothing, and it is the caller's own figure — the department row shows a
   * name and a glyph and no number at all, because the size of our scrape is
   * not the size of the shop.
   */
  count: number;
  /** Absolute href including the query string: the caller owns URL assembly. */
  href: string;
  active: boolean;
}

export type CatalogBrowseState =
  /** Nothing scraped yet, or nothing with a category. There is nothing to offer. */
  | { kind: "empty" }
  /** The read itself failed. Not the same thing as an empty shelf, and never dressed as one. */
  | { kind: "unavailable" }
  | {
      kind: "ready";
      /** The open shelf, or the search term when one is running. */
      category: string;
      /**
       * Everything we hold in that category, which may be more than is shown.
       *
       * Compared against, never printed: it is what tells the copy whether it
       * is looking at a whole shelf or the first page of one.
       */
      held: number;
      results: readonly CatalogProduct[];
    }
  /** A search, which may or may not have been narrowed to one category. */
  | {
      kind: "searched";
      query: string;
      /** The pill the search is narrowed to, or null for the whole catalogue. */
      category: string | null;
      /**
       * Everything that matched, uncapped. May exceed what we ranked.
       *
       * Compared against `considered`, never printed — see the copy below.
       */
      total: number;
      /**
       * How many of those matches we actually ranked and priced.
       * Equal to `total` unless the match set overflowed the cap, and the
       * difference is what the copy has to own: "cheapest first" is only true
       * over the rows we priced, so when it is less than `total` the screen
       * says the rest were never in the running rather than implying they were.
       *
       * It owns that in words rather than in figures. Neither this nor `total`
       * reaches the screen — the customer learns that an ordering is partial,
       * not how many rows we hold.
       */
      considered: number;
      results: readonly CatalogProduct[];
    };

export interface CatalogBrowsePanelProps {
  categories: readonly CatalogBrowseCategory[];
  state: CatalogBrowseState;
  /** One clock for the whole render, so every card agrees on how old a price is. */
  now: Date;
  /** What is in the box, so a shared search reopens with its own term. */
  query: string;
  /**
   * Where "show more" goes, or null when everything that matched is on screen.
   * Assembled by the caller, which owns the address.
   */
  moreHref: string | null;
  /** Back to the whole catalogue with no search. Null when nothing is being searched. */
  clearSearchHref: string | null;
  /** Back to the paste half of this screen. */
  pasteHref: string;
}

export function CatalogBrowsePanel({
  categories,
  state,
  now,
  query,
  moreHref,
  clearSearchHref,
  pasteHref,
}: CatalogBrowsePanelProps) {
  // Nothing at all, and nothing being searched for: there is no box worth
  // drawing over an empty catalogue.
  if (state.kind === "empty" && !query) {
    return <CatalogBrowseEmpty pasteHref={pasteHref} />;
  }

  return (
    <section
      aria-labelledby="catalog-browse-heading"
      className="tm-up flex flex-col gap-4 [animation-delay:0.08s] [animation-duration:0.5s]"
    >
      <header className="flex flex-col gap-1.5">
        <h2
          id="catalog-browse-heading"
          className="font-display text-[19px] leading-[1.2] font-bold sm:text-[21px]"
        >
          What we have already priced
        </h2>
        <p className="max-w-[64ch] text-[13.5px] leading-[1.45] font-medium text-tm-text-2">
          Products we have already read from Amazon and eBay, with the whole cedi
          total worked out: item, US sales tax, our fee and freight. This is a
          head start, not everything we can buy. Open one and we read the listing
          again and price it live before you pay.
        </p>
      </header>

      <CatalogBrowseSearchField defaultValue={query} clearHref={clearSearchHref} />

      <CatalogCategoryNav categories={categories} />

      {state.kind === "unavailable" ? (
        <CatalogBrowseUnavailable pasteHref={pasteHref} />
      ) : state.kind === "searched" ? (
        <CatalogSearchShelf state={state} now={now} moreHref={moreHref} pasteHref={pasteHref} />
      ) : state.kind === "ready" ? (
        <CatalogBrowseShelf
          category={state.category}
          held={state.held}
          results={state.results}
          now={now}
          moreHref={moreHref}
        />
      ) : (
        <CatalogBrowseEmptyShelf pasteHref={pasteHref} />
      )}

      <p className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-3">
        Cannot see it here?{" "}
        <Link
          href={pasteHref}
          className="font-semibold text-tm-coral underline-offset-2 hover:underline"
        >
          Paste a product link
        </Link>{" "}
        and we will price that exact item, from any store we support.
      </p>
    </section>
  );
}

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
 * The shelves, as departments.
 *
 * A thin adapter over `DepartmentRow` rather than a second row of its own: Home
 * offers exactly the same shelves, and the two drifted apart the last time they
 * were drawn separately. Everything about how a department LOOKS lives in that
 * component; this decides only which of them is open.
 *
 * NO COUNT RIDES ALONG ANY MORE. `CatalogBrowseCategory.count` is still read off
 * the server — the browse screen uses it to know a shelf is worth offering at
 * all — but it is no longer printed. It was the size of our scrape rather than
 * the size of the shop, and a two-digit figure beside a department told a
 * customer we hold fourteen electronics when what we can BUY is any listing
 * they paste.
 *
 * During a search the same departments carry the term with them, so pressing
 * one narrows what is on screen instead of throwing it away.
 */
export function CatalogCategoryNav({
  categories,
}: {
  categories: readonly CatalogBrowseCategory[];
}) {
  return (
    <DepartmentRow
      departments={categories.map((entry) => ({
        label: entry.category,
        href: entry.href,
        active: entry.active,
      }))}
    />
  );
}

/** One open shelf: what is on it, whether that is all of it, cheapest first. */
function CatalogBrowseShelf({
  category,
  held,
  results,
  now,
  moreHref,
}: {
  category: string;
  held: number;
  results: readonly CatalogProduct[];
  now: Date;
  moreHref: string | null;
}) {
  const unpriced = results.filter((result) => result.unpriceable).length;
  const showing = results.length;

  if (showing === 0) {
    return (
      <p className="rounded-[20px] border border-tm-border bg-card px-6 py-10 text-center text-sm leading-[1.5] font-medium text-tm-text-2">
        We hold nothing in {category} right now. Try another department, or
        paste the link to the product you want and we will price that one.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/*
        WHAT THIS SENTENCE MAY AND MAY NOT SAY. It still has to own the
        difference between a full shelf and a first page — "cheapest first" is a
        promise about an ordering, and somebody shown a slice of one deserves to
        know the rest exists. What it may no longer do is put a FIGURE on it:
        how many rows we have scraped is our number, not the customer's, and
        printed beside a department it reads as the size of the shop rather than
        the size of the head start. `held` therefore survives as a comparison
        and never as a value.
      */}
      <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
        <span className="font-semibold text-tm-ink">{category}</span>
        {": "}
        {showing < held
          ? "the cheapest of what we hold on this shelf, and there is more of it below."
          : showing === 1
            ? "one product, priced all in."
            : "everything we hold on this shelf, cheapest first."}
        {unpriced > 0 &&
          (unpriced === 1
            ? " One of these we could not price; it is at the end."
            : ` ${unpriced} of these we could not price; they are at the end.`)}
      </p>

      <CatalogResultsGrid results={results} now={now} />

      <ShowMore href={moreHref} />
    </div>
  );
}

/** A search over the catalogue, optionally narrowed to one shelf. */
function CatalogSearchShelf({
  state,
  now,
  moreHref,
  pasteHref,
}: {
  state: Extract<CatalogBrowseState, { kind: "searched" }>;
  now: Date;
  moreHref: string | null;
  pasteHref: string;
}) {
  const showing = state.results.length;

  if (showing === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-tm-border bg-card px-6 py-10 text-center">
        <p className="max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Nothing we have already priced matches{" "}
          <span className="font-semibold text-tm-ink">{state.query}</span>
          {state.category && (
            <>
              {" "}
              in <span className="font-semibold text-tm-ink">{state.category}</span>
            </>
          )}
          . That does not mean we cannot buy it. The catalogue is a head start,
          not the shop.
        </p>
        <BrowseFooterLink href={pasteHref} label="Paste a product link" icon="link" />
      </div>
    );
  }

  const unpriced = state.results.filter((result) => result.unpriceable).length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/*
        WHAT "CHEAPEST FIRST" IS ALLOWED TO CLAIM. The whole ranked match set is
        priced and sorted before any of it is shown, and `?n=` only slices that
        settled list — so the first card really is the cheapest of everything
        ranked here, and pressing "show more" appends instead of reshuffling
        rows somebody is already reading.

        The one thing that can still be left out is a match set bigger than the
        cap: those rows were never ranked, so the ordering does not cover them
        and the sentence has to say so out loud.

        IT SAYS SO WITHOUT THE FIGURES. It used to read "We ranked the 40
        closest of 312 matches", which gave away the size of our scrape to make
        a point about an ordering — and the point survives without either
        number. `considered` and `total` are still computed server-side and are
        still what decides WHICH sentence appears; they are simply never
        printed.
      */}
      <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
        <span className="font-semibold text-tm-ink">{state.query}</span>
        {state.category && (
          <>
            {" in "}
            <span className="font-semibold text-tm-ink">{state.category}</span>
          </>
        )}
        {": "}
        {showing < state.considered
          ? "the cheapest matches first, and there are more of them below."
          : showing === 1
            ? "one match, priced all in."
            : state.considered < state.total
              ? "every match we ranked, cheapest first."
              : "all the matches, cheapest first."}
        {state.considered < state.total &&
          " There were more matches than we rank in one go, so only the closest were priced. Cheapest first is true of those, not of every match. Add a word or pick a department to narrow it."}
        {unpriced > 0 &&
          (unpriced === 1
            ? " One of these we could not price; it is at the end."
            : ` ${unpriced} of these we could not price; they are at the end.`)}
      </p>

      <CatalogResultsGrid results={state.results} now={now} />

      <ShowMore href={moreHref} />
    </div>
  );
}

/**
 * "Show more" is a LINK, not a button.
 *
 * The page size lives in `?n=`, so pressing it is a navigation the server
 * answers: a reload keeps what the customer had opened, the back button closes
 * it again, and a longer page is an address they can send. A client-side
 * "load more" would have to price its extra rows somewhere, and pricing belongs
 * on the server.
 */
function ShowMore({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      className="mx-auto inline-flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-tm-border bg-card px-6 text-[14px] leading-none font-semibold text-tm-ink transition-colors hover:border-tm-coral hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Show more
      <ArrowRight weight="bold" className="size-4" aria-hidden />
    </Link>
  );
}

/** The shelf is open and holds nothing. The catalogue itself is not empty. */
function CatalogBrowseEmptyShelf({ pasteHref }: { pasteHref: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-tm-border bg-card px-6 py-10 text-center">
      <p className="max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
        We hold nothing on that shelf right now. Try another department, or
        paste the link to the product you want and we will price that one.
      </p>
      <BrowseFooterLink href={pasteHref} label="Paste a product link" icon="link" />
    </div>
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
