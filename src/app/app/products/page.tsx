import type { Metadata } from "next";
import Link from "next/link";

import { CATALOG_SEARCH } from "@/config/catalog";
import { searchCatalog } from "@/features/catalog/services/catalog-search.service";
import { CatalogSearchField } from "@/features/catalog/components/catalog-search-field";
import {
  CatalogIdleState,
  CatalogNoMatches,
  CatalogQueryTooShort,
  CatalogResultsGrid,
  CatalogSearchUnavailable,
} from "@/features/catalog/components/catalog-results";
import { logger } from "@/lib/logger";
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import type { CatalogProduct } from "@/features/catalog/types";

export const metadata: Metadata = {
  title: "Search priced products · Tomame",
  description:
    "Search products we have already read and priced, with the full cedi total worked out.",
};

/**
 * "Say what you want" — the half of the catalogue feature that had no screen.
 *
 * A Server Component, and the search lives in the URL. `?q=` is the only state
 * on this page: that is what makes a search shareable, what makes the back
 * button return to the previous search instead of to an empty box, and why
 * there is no client island here at all. Same reasoning as the admin filter
 * pills, applied to a customer-facing search.
 *
 * The page calls `searchCatalog` directly rather than its own HTTP endpoint.
 * The route handler exists for the browser (the similar-products rail uses it);
 * a server render going out over HTTP to its own origin would pay a round trip
 * to reach a function it can already call.
 *
 * NOTHING HERE PRICES ANYTHING. Every `total_ghs` is struck server-side by the
 * pricing engine inside `searchCatalog`, for quantity 1, at today's rate. The
 * cards only choose how to print it, and print nothing where the engine
 * declined.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const state = resolveCatalogQuery(q);

  // A FAILED SEARCH COSTS THE RESULTS, NOT THE PAGE. `searchCatalog` propagates
  // whatever PostgREST returns, and neither this segment nor `/app` defines an
  // `error.tsx`, so an uncaught throw here escalates to the root
  // `global-error.tsx` and replaces the whole application shell: no nav, no tab
  // bar, and the customer's own search text gone with the URL that died. The
  // sibling decision in this release is the same one: `listVisibleOrderPhotos`
  // swallows so that a storage fault costs the pictures rather than the journey.
  let response: Awaited<ReturnType<typeof searchCatalog>> | null = null;
  let searchFailed = false;
  if (state.kind === "ready") {
    try {
      // `pageSize`, not `maxLimit`. This screen has no "show more", so the cap it
      // asks for IS the page it renders; `maxLimit` is the ceiling the browse
      // panel climbs to one press at a time, and pointing this at it would make
      // every search here five times the cards and five times the pricing work
      // with no control to ask for them.
      response = await searchCatalog(state.query, { limit: CATALOG_SEARCH.pageSize });
    } catch (error) {
      searchFailed = true;
      logger.error("catalogue search failed", {
        query: state.query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // The service's own result type, assigned into the browser-safe mirror the
  // cards take. This assignment is the drift guard: a field that changes shape
  // in `catalog-search.service.ts` fails typecheck here rather than in a card.
  const results: CatalogProduct[] = response?.results ?? [];
  const unpriced = results.filter((result) => result.unpriceable).length;

  // One clock for the whole render, so every "checked 3 days ago" on the page
  // is measured against the same instant.
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <header className="tm-up flex flex-col gap-3">
        <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[42px]">
          Search without a link
        </h1>
        <p className="max-w-[60ch] text-[15px] leading-[1.5] font-medium text-tm-text-2">
          Say what you want and we will show you products we have already read
          and priced, with the whole cedi total worked out: item, US sales tax,
          our fee and freight. This is a head start, not everything we can buy;
          for anything you do not see, paste the link and we will price that
          exact item.
        </p>
      </header>

      <div className="tm-up [animation-delay:0.05s]">
        <CatalogSearchField
          defaultValue={state.kind === "idle" ? "" : searchTerm(state)}
        />
      </div>

      {state.kind === "idle" && <CatalogIdleState />}

      {state.kind === "too-short" && (
        <CatalogQueryTooShort minLength={state.minLength} />
      )}

      {state.kind === "ready" && searchFailed && <CatalogSearchUnavailable />}

      {state.kind === "ready" && !searchFailed && results.length === 0 && (
        <CatalogNoMatches query={state.query} />
      )}

      {state.kind === "ready" && !searchFailed && results.length > 0 && (
        <section
          aria-labelledby="catalog-results-heading"
          className="tm-up flex flex-col gap-3.5 [animation-delay:0.1s]"
        >
          <header className="flex flex-col gap-1">
            <h2
              id="catalog-results-heading"
              className="font-display text-[19px] leading-none font-bold"
            >
              {results.length === 1
                ? "1 product already priced"
                : `${results.length} products already priced`}
              {results.length > 1 && (
                <span className="font-sans text-[13px] font-semibold text-tm-text-3">
                  {" "}
                  cheapest first
                </span>
              )}
            </h2>
            <p
              className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-2"
            >
              Each total is what this item would cost you delivered, worked out
              when we last read the listing. Open one and we price it again
              live before you pay.
              {unpriced > 0 &&
                (unpriced === 1
                  ? " One of these we could not price; it is at the end."
                  : ` ${unpriced} of these we could not price; they are at the end.`)}
              {state.truncated &&
                ` We searched the first ${CATALOG_SEARCH.maxQueryLength} characters of what you typed.`}
            </p>
          </header>

          <CatalogResultsGrid results={results} now={now} />

          <p className="max-w-[64ch] text-[13px] leading-[1.45] font-medium text-tm-text-3">
            Not here? We buy from every store we support, not only these.{" "}
            <Link
              href="/app/orders/new"
              className="font-semibold text-tm-coral underline-offset-2 hover:underline"
            >
              Paste a product link
            </Link>{" "}
            and we will price that one for you.
          </p>
        </section>
      )}
    </div>
  );
}

/** What to put back in the box: the query we actually ran, or what was typed. */
function searchTerm(
  state: Exclude<ReturnType<typeof resolveCatalogQuery>, { kind: "idle" }>,
): string {
  return state.kind === "ready" ? state.query : state.typed;
}
