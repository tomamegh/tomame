import type { Metadata } from "next";
import { cookies } from "next/headers";

import { CATALOG_SEARCH } from "@/config/catalog";
import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  CatalogBrowsePanel,
  type CatalogBrowseCategory,
  type CatalogBrowseState,
} from "@/features/catalog/components/catalog-browse";
import {
  browseCatalogCategory,
  listBrowsableCategories,
} from "@/features/catalog/services/catalog-search.service";
import type { CatalogProduct } from "@/features/catalog/types";
import {
  buyForMeHref,
  resolveBrowseCategory,
  resolveBuyForMeMode,
} from "@/features/extraction/components/buy-for-me-mode";
import { PasteQueueView } from "@/features/extraction/components/paste-queue-view";
import { SUPPORTED_STORE_NAMES } from "@/features/extraction/scrapers";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { logger } from "@/lib/logger";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ExtractAndForward } from "./extract-and-forward";

/** Where the fuller search by name lives. */
const CATALOG_SEARCH_HREF = "/app/products";

export const metadata: Metadata = {
  title: "Buy for me",
  description:
    "Paste a link and we will price it, landed in Accra, or look through what we have already priced.",
};

/**
 * "Buy for me" — the nav's second tab.
 *
 * It used to be a dead click: with no `?url=` the screen did
 * `router.replace("/app")`, so pressing the tab bounced you straight back to
 * Home and the tab appeared to do nothing at all. Then it became the paste
 * queue. Now it is both halves of "tell us what you want": paste a link, or look
 * through what we have already read and priced.
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
  searchParams: Promise<{
    url?: string;
    watch?: string;
    mode?: string | string[];
    category?: string | string[];
  }>;
}) {
  const { url, watch, mode: modeParam, category: categoryParam } = await searchParams;
  // `?url=` queues the link and comes back here as `?watch=<id>`, so the row is
  // on screen — with its reading animation and its wait copy — while it reads.
  if (url) return <ExtractAndForward />;

  const mode = resolveBuyForMeMode(modeParam);

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

  const catalogueCount = catalogue.categories.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <PasteQueueView
      initialPastes={pastes.map((p) =>
        toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""), assisted.get(p.product_url) ?? null),
      )}
      stores={SUPPORTED_STORE_NAMES}
      renderedAt={new Date().toISOString()}
      watchId={typeof watch === "string" && watch ? watch : null}
      // Only an account can be told when a slow paste lands; the wait copy must
      // not promise a message to a visitor it cannot reach.
      notifies={user != null}
      mode={mode}
      catalogueCount={catalogueCount}
      searchHref={CATALOG_SEARCH_HREF}
      browse={
        mode === "browse"
          ? await renderBrowsePanel(catalogue, categoryParam)
          : null
      }
    />
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
 * The browse half, built on the server because the pricing engine is server
 * only, then handed to the client island as a finished node.
 *
 * ONE CATEGORY PER RENDER. Every card's total is struck live, and the engine's
 * inputs are loaded once per category read; opening all of them at once would
 * multiply that by the number of shelves to show a handful from each. The
 * category row carries the honest size of every shelf, so the whole catalogue is
 * visible even though one shelf is open.
 */
async function renderBrowsePanel(
  catalogue: CatalogueShape,
  categoryParam: string | string[] | undefined,
) {
  const active = resolveBrowseCategory(categoryParam, catalogue.categories);
  const pasteHref = buyForMeHref("paste");

  let state: CatalogBrowseState = catalogue.failed ? { kind: "unavailable" } : { kind: "empty" };

  if (active) {
    try {
      const response = await browseCatalogCategory(active, { limit: CATALOG_SEARCH.maxLimit });
      // The service's own result type assigned into the browser-safe mirror the
      // cards take. This assignment is the drift guard: a field that changes
      // shape in `catalog-search.service.ts` fails typecheck here rather than in
      // a card at runtime.
      const results: CatalogProduct[] = response.results;
      state = {
        kind: "ready",
        category: active,
        held: catalogue.categories.find((entry) => entry.category === active)?.count ?? results.length,
        results,
      };
    } catch (error) {
      logger.error("buy-for-me: could not browse catalogue category", {
        category: active,
        error: error instanceof Error ? error.message : String(error),
      });
      state = { kind: "unavailable" };
    }
  }

  const categories: CatalogBrowseCategory[] = catalogue.categories.map((entry) => ({
    category: entry.category,
    count: entry.count,
    href: buyForMeHref("browse", entry.category),
    active: entry.category === active,
  }));

  return (
    <CatalogBrowsePanel
      categories={categories}
      state={state}
      // One clock for the whole panel, so every "checked 3 days ago" on it is
      // measured against the same instant.
      now={new Date()}
      searchHref={CATALOG_SEARCH_HREF}
      pasteHref={pasteHref}
    />
  );
}
