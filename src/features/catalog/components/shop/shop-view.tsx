import Link from "next/link";
import {
  ArrowRight,
  LinkSimple,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react/ssr";

import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  facetTotal,
  getShopDepartmentGroups,
  getShopFacets,
  getShopPage,
  type ShopDepartmentGroup,
  type ShopFacets,
  type ShopProduct,
} from "../../services/catalog-shop.service";
import {
  SHOP_PAGE_SIZE,
  SHOP_SORTS,
  activeShopChips,
  clearFiltersHref,
  countActiveFilters,
  isGroupedView,
  shopHref,
  type ShopState,
} from "../../shop-params";
import {
  CatalogBrowseSearchField,
  CatalogBrowseUnavailable,
} from "../catalog-browse";
import { CatalogProductCard } from "../catalog-product-card";
import { DepartmentRow } from "../department-row";
import { ShopFacetSidebar } from "./shop-facets";
import { ShopFilterSheet } from "./shop-filter-sheet";
import { ShopPagination } from "./shop-pagination";
import { ShopPendingResults, ShopPendingRoot } from "./shop-pending";
import { ShopScrollAnchor } from "./shop-scroll-anchor";
import { ShopResultsSkeleton } from "./shop-skeleton";
import { ShopSortMenu } from "./shop-sort-menu";

/**
 * The shop: what we have already priced, as a store you can filter.
 *
 * STRUCTURE FROM THE REFERENCE KELVIN SENT (2026-09-30), COLOURS FROM TOMAME.
 * A title with the item count, a FILTER / SORT bar, removable chips, a sidebar
 * of grouped facets on desktop (a sheet on the phone), and a grid of big image
 * cards with the landed price in the accent colour — built from the tm-* tokens,
 * the existing product card and the department photo tiles.
 *
 * GROUPED UNTIL ASKED. With nothing chosen, the page is a shelf per department
 * (its best-selling few, "See all" into the filtered grid). Any filter, search,
 * sort or page is a question, and the flat, paged grid answers it.
 *
 * COUNTS ARE PRINTED NOW. The browse screen used to hide every count, because
 * the size of our scrape is not the size of the shop. Kelvin asked for a result
 * count and counts per filter, so they are back — and the copy below every
 * version of this page still says the catalogue is a head start, not the range.
 *
 * Nothing here is money maths. The database filters and orders on the
 * calculator's stored landed total; every card prints a total struck live for
 * this render; the card prints nothing where the engine declined.
 */
export async function ShopView({
  state,
  departments,
  now,
  pasteHref,
}: {
  state: ShopState;
  /**
   * Every department the catalogue holds, for the photo tiles. Not the facet
   * list: the tiles are the shop's map and stay put while filters narrow the
   * counts in the sidebar.
   */
  departments: readonly string[];
  /** One clock for the whole render, so every card agrees on how old a price is. */
  now: Date;
  pasteHref: string;
}) {
  const grouped = isGroupedView(state);

  let facets: ShopFacets;
  let body: React.ReactNode;
  let total: number;
  let pastEnd = false;

  try {
    if (grouped) {
      const [groups, groupFacets] = await Promise.all([
        getShopDepartmentGroups(),
        getShopFacets(state),
      ]);
      facets = groupFacets;
      total = facetTotal(groupFacets, state);
      body = (
        <ShopGroups state={state} groups={groups} now={now} total={total} />
      );
    } else {
      const result = await getShopPage(state);
      facets = result.facets;
      total = result.total;
      pastEnd = result.kind === "past-end";
      body =
        result.kind === "past-end" ? (
          <ShopPastEnd state={state} pageCount={result.pageCount} />
        ) : result.products.length === 0 ? (
          <ShopNoResults state={state} pasteHref={pasteHref} />
        ) : (
          <>
            <ShopGrid products={result.products} now={now} />
            <ShopPagination state={state} pageCount={result.pageCount} />
          </>
        );
    }
  } catch (error) {
    // A failed read costs the shop, not the page: the paste form above it is a
    // different code path and must survive the catalogue being down.
    logger.error("shop: could not read the catalogue", {
      state: shopHref(state),
      error: error instanceof Error ? error.message : String(error),
    });
    return <CatalogBrowseUnavailable pasteHref={pasteHref} />;
  }

  const activeCount = countActiveFilters(state);
  const chips = activeShopChips(state);
  const first = (state.page - 1) * SHOP_PAGE_SIZE + 1;
  const last = Math.min(state.page * SHOP_PAGE_SIZE, total);
  const token = shopHref(state);

  return (
    <ShopPendingRoot token={token}>
      <section
        aria-labelledby="shop-heading"
        className="tm-up flex min-w-0 flex-col gap-5 [animation-delay:0.08s] [animation-duration:0.5s]"
      >
        <header className="flex min-w-0 flex-col gap-1.5">
          <h2
            id="shop-heading"
            className="font-display text-[24px] leading-[1.1] font-bold tracking-[-0.02em] break-words sm:text-[30px]"
          >
            {shopTitle(state)}
            <span className="tm-nums ml-2 align-middle font-sans text-[14px] font-semibold tracking-normal text-tm-text-3 sm:text-[15px]">
              · {total.toLocaleString("en-GH")} {total === 1 ? "item" : "items"}
            </span>
          </h2>
          <p className="max-w-[68ch] text-[13.5px] leading-[1.45] font-medium text-tm-text-2">
            Already read from Amazon and eBay and priced all in: item, US sales
            tax, our fee and freight. Open one and we read it again and price it
            live before you pay.
          </p>
        </header>

        <CatalogBrowseSearchField
          defaultValue={state.q}
          clearHref={state.q ? shopHref(state, { q: "" }) : null}
        />

        <DepartmentRow
          preserveScroll
          compact={Boolean(state.category)}
          departments={[
            ...(state.category
              ? [
                  {
                    label: "All categories",
                    href: shopHref(state, { category: null }),
                    active: false,
                  },
                ]
              : []),
            // In the compact strip the open category leads, so it is never
            // scrolled out of sight past the edge of the strip.
            ...(state.category
              ? [...departments].sort((a, b) => Number(b === state.category) - Number(a === state.category))
              : departments
            ).map((label) => ({
              label,
              href: shopHref(state, { category: label }),
              active: state.category === label,
            })),
          ]}
        />

        <ShopScrollAnchor id="shop-results" token={token} />

        {/* The toolbar. FILTER opens the sheet below `lg`; from `lg` the sidebar is the filter. */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-tm-border py-3">
          <div className="flex min-w-0 items-center gap-3">
            <ShopFilterSheet
              state={state}
              facets={facets}
              activeCount={activeCount}
              className="lg:hidden"
            />
            <p
              className="tm-nums hidden text-[13.5px] font-medium text-tm-text-2 sm:block"
              aria-live="polite"
            >
              {grouped
                ? `${facets.departments.length} categories`
                : total === 0
                  ? "No results"
                  : pastEnd
                    ? `${total.toLocaleString("en-GH")} items`
                    : `Showing ${first.toLocaleString("en-GH")}–${last.toLocaleString("en-GH")} of ${total.toLocaleString("en-GH")}`}
            </p>
          </div>
          <ShopSortMenu
            current={state.sort}
            options={SHOP_SORTS.map((s) => ({
              ...s,
              href: shopHref(state, { sort: s.value }),
            }))}
          />
        </div>

        {chips.length > 0 && (
          <ul
            aria-label="Active filters"
            className="-mt-1 flex min-w-0 flex-wrap items-center gap-2"
          >
            {chips.map((chip) => (
              <li key={chip.key} className="min-w-0">
                <Link
                  href={chip.removeHref}
                  scroll={false}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-tm-coral/35 bg-tm-tint pr-2.5 pl-3 text-[13px] font-semibold text-tm-coral-strong transition-colors hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
                >
                  <span className="break-words">{chip.label}</span>
                  <X weight="bold" className="size-3 shrink-0" aria-hidden />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={clearFiltersHref(state)}
                scroll={false}
                className="px-1 text-[13px] font-semibold text-tm-text-2 underline underline-offset-2 hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
              >
                Clear all
              </Link>
            </li>
          </ul>
        )}

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside aria-label="Filters" className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-1 pb-4">
              <ShopFacetSidebar state={state} facets={facets} />
            </div>
          </aside>
          <ShopPendingResults
            fallback={<ShopResultsSkeleton grouped={grouped} />}
          >
            {body}
          </ShopPendingResults>
        </div>

        <p className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-3">
          Cannot see it here? This is a head start, not everything we can buy.{" "}
          <Link
            href={pasteHref}
            className="font-semibold text-tm-coral underline-offset-2 hover:underline"
          >
            Paste a product link
          </Link>{" "}
          and we will price that exact item, from any store we support.
        </p>
      </section>
    </ShopPendingRoot>
  );
}

function shopTitle(state: ShopState): string {
  if (state.q && state.category) return `“${state.q}” in ${state.category}`;
  if (state.q) return `“${state.q}”`;
  if (state.category) return state.category;
  return isGroupedView(state)
    ? "All categories"
    : "Everything we have priced";
}

/** The flat grid: 2 across on a phone, 3 from `sm` (and 3 beside the sidebar). */
function ShopGrid({
  products,
  now,
}: {
  products: readonly ShopProduct[];
  now: Date;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {products.map((product) => (
        <CatalogProductCard key={product.id} product={product} now={now} />
      ))}
    </ul>
  );
}

/**
 * The front page: one shelf per department, its best-selling few first.
 *
 * Below `lg` a shelf is a sideways rail of fixed-width cards — the one shape
 * that cannot widen a 390px page — and from `lg` it is a row of four.
 */
function ShopGroups({
  state,
  groups,
  now,
  total,
}: {
  state: ShopState;
  groups: readonly ShopDepartmentGroup[];
  now: Date;
  total: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-9">
      {groups.map((group, i) => {
        const headingId = `shop-dept-${i}`;
        const seeAll = shopHref(state, { category: group.category });
        return (
          <section
            key={group.category}
            aria-labelledby={headingId}
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex min-w-0 items-end justify-between gap-3">
              <h3
                id={headingId}
                className="min-w-0 font-display text-[19px] leading-[1.2] font-bold break-words sm:text-[21px]"
              >
                {group.category}
                <span className="tm-nums ml-2 font-sans text-[13px] font-semibold text-tm-text-3">
                  · {group.count} {group.count === 1 ? "item" : "items"}
                </span>
              </h3>
              <Link
                href={seeAll}
                className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
              >
                See all
                <span className="sr-only"> in {group.category}</span>
                <ArrowRight weight="bold" className="size-3.5" aria-hidden />
              </Link>
            </div>
            <ul
              className={cn(
                "-mx-1 flex min-w-0 snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-2",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                "lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0",
              )}
            >
              {group.products.map((product) => (
                <CatalogProductCard
                  key={product.id}
                  product={product}
                  now={now}
                  className="w-[168px] shrink-0 snap-start sm:w-[208px] lg:w-auto"
                />
              ))}
            </ul>
          </section>
        );
      })}

      <Link
        href={shopHref(state, { view: "all" })}
        className="mx-auto inline-flex h-[46px] items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-tm-border bg-card px-6 text-[14px] leading-none font-semibold text-tm-ink transition-colors hover:border-tm-coral hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Browse all {total.toLocaleString("en-GH")} items
        <ArrowRight weight="bold" className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function ShopNoResults({
  state,
  pasteHref,
}: {
  state: ShopState;
  pasteHref: string;
}) {
  const filtered = countActiveFilters(state) > 0;
  return (
    <div className="flex flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-tint text-tm-coral">
        <MagnifyingGlass weight="duotone" className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-[20px] leading-[1.2] font-bold">
          No results
        </h3>
        <p className="mx-auto max-w-[48ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          {filtered
            ? "Nothing we have priced matches all of those filters. Take one off, or clear them and start again."
            : "Nothing we have priced matches that search. That does not mean we cannot buy it."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {filtered && (
          <Link
            href={clearFiltersHref(state)}
            scroll={false}
            className="tm-cta-gradient inline-flex h-11 items-center justify-center rounded-[14px] px-5 text-[14px] font-bold text-white focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Clear filters
          </Link>
        )}
        {state.q && (
          <Link
            href={shopHref(state, { q: "" })}
            scroll={false}
            className="inline-flex h-11 items-center justify-center rounded-[14px] border-[1.5px] border-tm-border bg-card px-5 text-[14px] font-semibold text-tm-ink hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
          >
            Clear search
          </Link>
        )}
        <Link
          href={pasteHref}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-tm-coral hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
        >
          <LinkSimple weight="bold" className="size-3.5" aria-hidden />
          Paste a product link
        </Link>
      </div>
    </div>
  );
}

function ShopPastEnd({
  state,
  pageCount,
}: {
  state: ShopState;
  pageCount: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <h3 className="font-display text-[20px] leading-[1.2] font-bold">
        That page is past the end
      </h3>
      <p className="max-w-[46ch] text-sm leading-[1.5] font-medium text-tm-text-2">
        These filters fill {pageCount} {pageCount === 1 ? "page" : "pages"}.
      </p>
      <Link
        href={shopHref(state, { page: pageCount })}
        scroll={false}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-tm-coral hover:text-tm-coral-strong"
      >
        Go to the last page
        <ArrowRight weight="bold" className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
