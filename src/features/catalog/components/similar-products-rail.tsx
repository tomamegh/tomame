"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { deriveCatalogTerm } from "@/features/catalog/services/catalog-term";
import { cn } from "@/lib/utils";
import { useCatalogSearch } from "../hooks/useCatalogSearch";
import { CatalogProductCard } from "./catalog-product-card";
import { pickSimilarProducts } from "./format";

/** Enough to be worth a look, few enough to stay secondary to the quote. */
const RAIL_LIMIT = 6;

export interface SimilarProductsRailProps {
  /** The extracted product's title. Null when the extractor could not read one. */
  title: string | null;
  /** Brand, where the extraction found one. Leads the derived term. */
  brand?: string | null;
  /** The listing being quoted. Never offered back as an alternative to itself. */
  productUrl: string;
  className?: string;
}

/**
 * Already-priced alternatives to the product the customer just got a price for.
 *
 * SECONDARY BY CONSTRUCTION. It sits below everything the customer came for,
 * renders nothing at all while it loads, and renders nothing at all when the
 * catalogue has no hits: an empty shelf under a quote reads as a shop that has
 * run out, which is not what happened.
 *
 * The term is not the raw title. `deriveCatalogTerm` is the same cut-down the
 * scraper uses to decide what to search for, so the rail asks the catalogue the
 * question the catalogue was filled to answer. Searched verbatim, a listing
 * title returns that exact phone in that exact colour, which is the same
 * product again rather than an alternative.
 *
 * Every figure is the server's landed total for that product. Nothing here
 * prices anything, and `pickSimilarProducts` drops the rows the server could
 * not price rather than showing a card with a gap where the money goes.
 */
export function SimilarProductsRail({
  title,
  brand,
  productUrl,
  className,
}: SimilarProductsRailProps) {
  const term = useMemo(() => deriveCatalogTerm(title, brand), [title, brand]);
  const { data } = useCatalogSearch(term, { limit: RAIL_LIMIT * 2 });

  // One clock for the whole rail, fixed at mount, so the "checked 3 days ago"
  // lines cannot drift apart on an unrelated re-render of the quote above.
  const [now] = useState(() => new Date());

  const similar = useMemo(
    () =>
      data
        ? pickSimilarProducts(data.results, {
            excludeUrl: productUrl,
            limit: RAIL_LIMIT,
          })
        : [],
    [data, productUrl],
  );

  if (!term || similar.length === 0) return null;

  return (
    <section
      aria-labelledby="similar-products-heading"
      className={cn(
        "tm-up flex min-w-0 flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-4 lg:p-5 [animation-duration:0.5s]",
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="similar-products-heading"
          className="font-display text-[17px] leading-none font-bold lg:text-[19px]"
        >
          Already priced, like this one
        </h2>
        <Link
          href={`/app/products?q=${encodeURIComponent(term)}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Search {term}
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      <p className="max-w-[60ch] text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
        Products we have read and priced before, landed in GH₵. The figures are
        from our last check of each listing, so opening one prices it afresh.
      </p>

      {/*
        A scroll track, not a wrapping grid: the rail must never be able to
        widen the quote screen on a phone, and a fixed item width inside an
        `overflow-x-auto` box is the guarantee of that.
      */}
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {similar.map((product) => (
          <CatalogProductCard
            key={product.id}
            product={product}
            now={now}
            size="compact"
            className="w-[168px] shrink-0 snap-start sm:w-[186px]"
          />
        ))}
      </ul>
    </section>
  );
}
