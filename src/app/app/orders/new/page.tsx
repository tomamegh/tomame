import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { Suspense } from "react";

import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  CatalogBrowseEmpty,
  CatalogBrowseUnavailable,
} from "@/features/catalog/components/catalog-browse";
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import { ShopSkeleton } from "@/features/catalog/components/shop/shop-skeleton";
import { ShopView } from "@/features/catalog/components/shop/shop-view";
import {
  readLandedPriceFreshness,
  refreshCatalogLandedPrices,
} from "@/features/catalog/services/catalog-landed-price.service";
import { listBrowsableCategories } from "@/features/catalog/services/catalog-search.service";
import {
  isGroupedView,
  parseShopParams,
  shopHref,
  type ShopSearchParams,
} from "@/features/catalog/shop-params";
import {
  buyForMeHref,
  resolveBuyForMeMode,
} from "@/features/extraction/components/buy-for-me-mode";
import { PasteQueueView } from "@/features/extraction/components/paste-queue-view";
import { SUPPORTED_STORE_NAMES } from "@/features/extraction/scrapers";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { logger } from "@/lib/logger";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ExtractAndForward } from "./extract-and-forward";
import { BannerSlot } from "@/features/banners/components";

export const metadata: Metadata = {
  title: "Buy for me",
  description:
    "Paste a link and we will price it, landed in Accra, look through what we have already priced, or ask a buyer to go and find it.",
};

/**
 * "Buy for me" — the nav's second tab.
 *
 * It used to be a dead click: with no `?url=` the screen did
 * `router.replace("/app")`, so pressing the tab bounced you straight back to
 * Home and the tab appeared to do nothing at all. Then it became the paste
 * queue. Now it is all three ways of saying "this is what I want": paste a link,
 * look through what we have already read and priced, or describe it and have a
 * buyer go and find it.
 *
 * WHY THE SECOND HALF IS HERE. The pre-priced catalogue had a screen
 * (`/app/products`) and no way in. The only link to it was a rail beside a
 * quote, and the only way to reach a quote was to paste a link first. Kelvin:
 * "To access search without a link, a user must first search with a link, and
 * then navigate there." This tab is the way in, and it is public, so a visitor
 * with no account can see what we hold before they hand over anything.
 *
 * A `?url=` still means "price this one link and take me to it", which is how
 * the Home paste bar, a shared link and every catalogue card arrive. That path
 * is unchanged and is checked before anything else here, so it costs nothing.
 *
 * Public, like the rest of the quote flow (`src/lib/supabase/proxy.ts` carves
 * this route out): a signed-out visitor sees the links they pasted under their
 * own `tm_quote_session` cookie, and browses the catalogue without an account.
 * `/app/products`, the fuller search this screen links to, was carved out in the
 * same change: leaving it gated while browsing the same catalogue here was open
 * made one half of one feature a login wall, and it was the half a visitor
 * reaches by following our own link.
 *
 * NOTHING HERE PRICES ANYTHING. Every cedi total on a browse card is struck by
 * the pricing engine inside `browseCatalogCategory`, server side, for quantity
 * one; the cards only choose how to print it, and print nothing where the
 * engine declined.
 */
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams>;
}) {
  const params = await searchParams;
  const url = typeof params.url === "string" ? params.url : undefined;
  const watch = typeof params.watch === "string" ? params.watch : undefined;
  // `?url=` queues the link and comes back here as `?watch=<id>`, so the row is
  // on screen — with its reading animation and its wait copy — while it reads.
  if (url) return <ExtractAndForward />;

  const mode = resolveBuyForMeMode(params.mode);

  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };

  // The catalogue's shape is read on BOTH halves, and in parallel with the
  // viewer's pastes rather than after them: the paste half needs it only to know
  // whether the browse switch is worth drawing, and that answer must not cost
  // the screen a serial round trip.
  const [pastes, catalogue] = await Promise.all([
    listPastesForViewer(viewer),
    readCatalogueShape(),
  ]);

  const [facts, assisted] = await Promise.all([
    getQuoteFacts(pastes.map((p) => p.extraction_cache_id ?? "")),
    listOpenAssistedRequestsByUrl(viewer, pastes.map((p) => p.product_url)),
  ]);

  // Whether the browse mode is worth offering, and nothing else. The switch
  // never prints this — see `PasteQueueView`'s prop doc for why.
  const catalogueCount = catalogue.categories.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <BannerSlot placement="buy" />
      <PasteQueueView
        initialPastes={pastes.map((p) =>
          toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""), assisted.get(p.product_url) ?? null),
        )}
        stores={SUPPORTED_STORE_NAMES}
        renderedAt={new Date().toISOString()}
        watchId={watch ? watch : null}
        // Only an account can be told when a slow paste lands; the wait copy must
        // not promise a message to a visitor it cannot reach.
        notifies={user != null}
        mode={mode}
        catalogueCount={catalogueCount}
        browse={
          mode === "browse" ? await renderShop(catalogue, params) : null
        }
      />
    </div>
  );
}

interface CatalogueShape {
  categories: { category: string; count: number }[];
  /** The read itself failed, which is not the same thing as an empty catalogue. */
  failed: boolean;
}

/**
 * What the catalogue holds, or an honest nothing.
 *
 * A FAILED READ COSTS THE CATALOGUE, NOT THE PAGE. Neither this segment nor
 * `/app` defines an `error.tsx`, so an uncaught throw escalates to the root
 * `global-error.tsx` and replaces the whole application shell: no nav, no tab
 * bar, and the paste form the customer actually came for gone with it. Pasting
 * a link is a different code path and must survive the catalogue being down.
 * Same decision `/app/products` makes for its search.
 *
 * A category with nothing in it is not offered. `listCatalogCategories` already
 * drops empty and nameless ones; the filter here is the guarantee rather than
 * the mechanism.
 */
async function readCatalogueShape(): Promise<CatalogueShape> {
  try {
    const categories = await listBrowsableCategories();
    return { categories: categories.filter((entry) => entry.count > 0), failed: false };
  } catch (error) {
    logger.error("buy-for-me: could not list catalogue categories", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { categories: [], failed: true };
  }
}

/**
 * The browse half: the shop (`ShopView`), built on the server because the
 * pricing engine is server only, then handed to the client island as a
 * finished node.
 *
 * THE ADDRESS IS THE STATE. Filters, sort and page are parsed from the query
 * string by `parseShopParams` and every link on the shop is built by
 * `shopHref`, so a filtered page is shareable and back/forward walks it. The
 * old `?n=` page size is ignored: a link carrying it opens page one.
 *
 * WHY THE URL STAYED. The shop lives on Buy for me's browse mode rather than a
 * new `/app/shop`: every existing way in (Home's department tiles and hero
 * search, the mode switch, shared links) already lands here, the route is in
 * the proxy's public carve-out, the nav already highlights it, and the paste
 * rows that are still reading stay on screen while the customer shops.
 *
 * LANDED PRICES FIRST. The shop filters and sorts on the calculator's stored
 * figure (migration 080). Rows never priced — a fresh deploy, a listing the
 * scraper just re-read — are priced before the read, so the first page is not
 * ordered on nothing; a stored set that is merely old is refreshed after the
 * response, so no visitor waits on it.
 *
 * THE SUSPENSE BOUNDARY IS KEYED BY THE ADDRESS, so every filter, sort and
 * page shows the skeleton instead of leaving the old grid up under a new chip.
 */
async function renderShop(catalogue: CatalogueShape, params: ShopSearchParams) {
  const pasteHref = buyForMeHref("paste");
  const queryState = resolveCatalogQuery(params.q);
  // `too-short` is no search at all here: the shop always has shelves to fall
  // back to, so one stray character shows the catalogue instead of an error.
  const q = queryState.kind === "ready" ? queryState.query : "";

  if (catalogue.failed) return <CatalogBrowseUnavailable pasteHref={pasteHref} />;
  if (catalogue.categories.length === 0) return <CatalogBrowseEmpty pasteHref={pasteHref} />;

  const departments = catalogue.categories.map((entry) => entry.category);
  const state = { ...parseShopParams(params, departments), q };

  try {
    const freshness = await readLandedPriceFreshness();
    if (freshness === "missing") await refreshCatalogLandedPrices();
    else if (freshness === "stale") {
      after(() =>
        refreshCatalogLandedPrices().then(
          () => undefined,
          (error: unknown) =>
            logger.error("buy-for-me: background landed-price refresh failed", {
              error: error instanceof Error ? error.message : String(error),
            }),
        ),
      );
    }
  } catch (error) {
    // Stale ordering beats no shop: the cards are priced live either way.
    logger.error("buy-for-me: could not refresh catalogue landed prices", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <Suspense key={shopHref(state)} fallback={<ShopSkeleton grouped={isGroupedView(state)} />}>
      <ShopView state={state} departments={departments} now={new Date()} pasteHref={pasteHref} />
    </Suspense>
  );
}
