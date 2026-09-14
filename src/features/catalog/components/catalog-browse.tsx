import Link from "next/link";
import {
  ArrowRight,
  LinkSimple,
  MagnifyingGlass,
  Storefront,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { CatalogProduct } from "../types";
import { CatalogResultsGrid } from "./catalog-results";

/**
 * Browsing the pre-priced catalogue, grouped by the categories it actually
 * holds.
 *
 * This is the half of the catalogue a customer can reach with nothing in their
 * hands. Search asks them to already know the words; this asks nothing and just
 * shows what we have. The categories are derived from the products themselves,
 * so there is no list of shelves here that the data does not fill: an empty
 * catalogue says so in one sentence rather than offering eight dead shelves.
 *
 * ONE SHELF IS OPEN AT A TIME, and that is a cost decision rather than a taste
 * one. Every total on a card is struck live by the pricing engine when the page
 * renders, and the engine's inputs are loaded once per category read. Opening
 * every category at once would multiply that by the number of shelves to show
 * four products from each. The category row shows the whole shape of the
 * catalogue; the grid shows the shelf that is open.
 *
 * Nothing here calculates money. `total_ghs` arrives already struck server
 * side, and the card refuses to print a figure the engine declined to give.
 */

export interface CatalogBrowseCategory {
  category: string;
  /** How many products we hold on that shelf. Printed as it comes, never rounded. */
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
      category: string;
      /** Everything we hold in that category, which may be more than is shown. */
      held: number;
      results: readonly CatalogProduct[];
    };

export interface CatalogBrowsePanelProps {
  categories: readonly CatalogBrowseCategory[];
  state: CatalogBrowseState;
  /** One clock for the whole render, so every card agrees on how old a price is. */
  now: Date;
  /** The fuller search by name. */
  searchHref: string;
  /** Back to the paste half of this screen. */
  pasteHref: string;
}

export function CatalogBrowsePanel({
  categories,
  state,
  now,
  searchHref,
  pasteHref,
}: CatalogBrowsePanelProps) {
  if (state.kind === "empty") {
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

      <CatalogCategoryNav categories={categories} />

      {state.kind === "unavailable" ? (
        <CatalogBrowseUnavailable pasteHref={pasteHref} />
      ) : (
        <CatalogBrowseShelf
          category={state.category}
          held={state.held}
          results={state.results}
          now={now}
        />
      )}

      <p className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-3">
        Looking for something in particular?{" "}
        <Link
          href={searchHref}
          className="font-semibold text-tm-coral underline-offset-2 hover:underline"
        >
          Search by name
        </Link>
        , or{" "}
        <Link
          href={pasteHref}
          className="font-semibold text-tm-coral underline-offset-2 hover:underline"
        >
          paste a product link
        </Link>{" "}
        and we will price that exact item, from any store we support.
      </p>
    </section>
  );
}

/**
 * The shelves, with their real sizes on them.
 *
 * Links, not buttons: the open shelf is in the address bar, so the back button
 * walks back through the shelves somebody looked at and a category is a thing
 * they can send to a friend.
 */
export function CatalogCategoryNav({
  categories,
}: {
  categories: readonly CatalogBrowseCategory[];
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Browse by category" className="flex flex-wrap items-center gap-1.5">
      {categories.map((entry) => (
        <Link
          key={entry.category}
          href={entry.href}
          aria-current={entry.active ? "page" : undefined}
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] leading-none font-semibold transition-colors",
            "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            // `bg-tm-tint` rather than the pill background the admin filter
            // pills use: that token is declared on the root but never registered
            // in the theme block, so Tailwind emits no rule for it and the open
            // shelf would be indistinguishable from a closed one.
            entry.active
              ? "border-tm-coral/40 bg-tm-tint text-tm-coral-strong"
              : "border-tm-border bg-card text-tm-text-2 hover:border-tm-coral/30 hover:text-tm-ink",
          )}
        >
          <span className="truncate">{entry.category}</span>
          <span
            className={cn(
              "tm-nums shrink-0 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold",
              entry.active ? "bg-card text-tm-coral-strong" : "bg-tm-paper text-tm-text-3",
            )}
          >
            {entry.count}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** One open shelf: what is on it, how much of it we are showing, cheapest first. */
function CatalogBrowseShelf({
  category,
  held,
  results,
  now,
}: {
  category: string;
  held: number;
  results: readonly CatalogProduct[];
  now: Date;
}) {
  const unpriced = results.filter((result) => result.unpriceable).length;
  const showing = results.length;

  if (showing === 0) {
    return (
      <p className="rounded-[20px] border border-tm-border bg-card px-6 py-10 text-center text-sm leading-[1.5] font-medium text-tm-text-2">
        We hold nothing in {category} right now. Try another category, or paste
        the link to the product you want and we will price that one.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
        <span className="font-semibold text-tm-ink">{category}</span>
        {": "}
        {showing < held
          ? `showing ${showing} of ${held} we hold, cheapest first.`
          : showing === 1
            ? "one product, priced all in."
            : `all ${showing} we hold, cheapest first.`}
        {unpriced > 0 &&
          (unpriced === 1
            ? " One of these we could not price; it is at the end."
            : ` ${unpriced} of these we could not price; they are at the end.`)}
      </p>

      <CatalogResultsGrid results={results} now={now} />
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
