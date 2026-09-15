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
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import {
  browseCatalogCategory,
  listBrowsableCategories,
  searchCatalog,
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
  searchParams: Promise<{
    url?: string;
    watch?: string;
    mode?: string | string[];
    category?: string | string[];
    q?: string | string[];
    n?: string | string[];
  }>;
}) {
  const {
    url,
    watch,
    mode: modeParam,
    category: categoryParam,
    q: qParam,
    n: nParam,
  } = await searchParams;
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

  // Whether the browse mode is worth offering, and nothing else. The switch
  // never prints this — see `PasteQueueView`'s prop doc for why.
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
      browse={
        mode === "browse"
          ? await renderBrowsePanel(catalogue, categoryParam, qParam, nParam)
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
 * TWO SHAPES, ONE PANEL. With no `?q=` it is a shelf: one category, cheapest
 * first. With a `?q=` it is a search over the whole catalogue, which `?category=`
 * then narrows. The pills carry the term with them either way, so pressing one
 * mid-search filters the matches instead of throwing the search away.
 *
 * ONE READ PER RENDER. Every card's total is struck live, and the engine's
 * inputs are loaded once per read; opening every category at once would multiply
 * that by the number of shelves to show a handful from each. The category row
 * carries the honest size of every shelf, so the whole catalogue is visible even
 * though one shelf is open.
 *
 * `?n=` IS THE PAGE SIZE, and it is a number the server clamps rather than one
 * the address dictates: a hand-typed `?n=100000` would otherwise ask the pricing
 * engine for a hundred thousand live calculations on a public route.
 */
async function renderBrowsePanel(
  catalogue: CatalogueShape,
  categoryParam: string | string[] | undefined,
  qParam: string | string[] | undefined,
  nParam: string | string[] | undefined,
) {
  const pasteHref = buyForMeHref("paste");
  const queryState = resolveCatalogQuery(qParam);
  // `too-short` is treated as no search at all here rather than as its own
  // screen: this panel always has a shelf to fall back to, so one stray
  // character shows the catalogue instead of an error about it.
  const query = queryState.kind === "ready" ? queryState.query : "";
  const limit = resolvePageSize(nParam);

  // A search runs over the whole catalogue unless a pill narrows it, so an
  // absent `?category=` means "all" here — the opposite of what it means when
  // browsing, where it means "open the fullest shelf".
  const narrowed = query ? matchCategory(categoryParam, catalogue.categories) : null;
  const active = query ? narrowed : resolveBrowseCategory(categoryParam, catalogue.categories);

  let state: CatalogBrowseState = catalogue.failed ? { kind: "unavailable" } : { kind: "empty" };
  let total = 0;

  try {
    if (query) {
      // THE WHOLE RANKED SET, THEN A SLICE OF IT — not a growing window.
      //
      // The search RPC picks its rows by text rank and `searchCatalog` then
      // sorts what it got by landed GH₵. Asking it for 24 and later for 48
      // therefore does NOT append: the second read pulls in ranks 25-48, and a
      // cheaper one among them sorts to the top and pushes every card the
      // customer was reading down the page. Worse, the first 24 were never the
      // cheapest 24 of the match — they were the best-ranked 24, shown cheapest
      // among themselves, under a heading that claimed otherwise.
      //
      // So the cap is read once, priced once and sorted once, and `?n=` only
      // decides how much of that settled list is drawn. "Cheapest first" is then
      // true over everything counted, and "show more" genuinely appends.
      //
      // This costs no extra vendor call and no extra query — one RPC either way
      // — and the pricing loop it lengthens is arithmetic on an already-loaded
      // calculator. What `?n=` still saves is the cards themselves.
      const response = await searchCatalog(query, {
        limit: CATALOG_SEARCH.maxLimit,
        category: narrowed,
      });
      // The service's own result type assigned into the browser-safe mirror the
      // cards take. This assignment is the drift guard: a field that changes
      // shape in `catalog-search.service.ts` fails typecheck here rather than in
      // a card at runtime.
      const considered: CatalogProduct[] = response.results;
      total = response.total;
      state = {
        kind: "searched",
        query,
        category: narrowed,
        total,
        considered: considered.length,
        // Sliced AFTER the sort, so the unpriceable rows the service parked at
        // the end stay at the end instead of leading the first page.
        results: considered.slice(0, limit),
      };
    } else if (active) {
      const response = await browseCatalogCategory(active, { limit });
      const results: CatalogProduct[] = response.results;
      total = catalogue.categories.find((entry) => entry.category === active)?.count ?? results.length;
      state = { kind: "ready", category: active, held: total, results };
    }
  } catch (error) {
    // A FAILED READ COSTS THE RESULTS, NOT THE PAGE — the same decision
    // `readCatalogueShape` makes above, and for the same reason: the paste form
    // the customer actually came for must survive the catalogue being down.
    logger.error("buy-for-me: could not read the catalogue", {
      category: active,
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    state = { kind: "unavailable" };
  }

  const shown = state.kind === "ready" || state.kind === "searched" ? state.results.length : 0;
  // What "show more" can still reveal, which is NOT always the total. A search
  // counts every match but only ranks the cap's worth of them, so past that
  // point there is nothing left on the server to draw and the button must go —
  // the copy says so instead, and asks for a narrower search.
  const revealable = state.kind === "searched" ? state.considered : total;

  const categories: CatalogBrowseCategory[] = catalogue.categories.map((entry) => ({
    category: entry.category,
    count: entry.count,
    // The term rides along, and the page size deliberately does not: pressing a
    // pill is a new question, and it should be answered with a first page.
    href: buyForMeHref("browse", { category: entry.category, q: query }),
    active: entry.category === active,
  }));

  // Only during a search, and only when a pill is holding it narrow — "all" is
  // where browsing already starts, so offering it there would be a pill that
  // changes nothing.
  if (query && narrowed) {
    categories.unshift({
      category: "All categories",
      count: catalogue.categories.reduce((sum, entry) => sum + entry.count, 0),
      href: buyForMeHref("browse", { q: query }),
      active: false,
    });
  }

  return (
    <CatalogBrowsePanel
      categories={categories}
      state={state}
      // One clock for the whole panel, so every "checked 3 days ago" on it is
      // measured against the same instant.
      now={new Date()}
      query={query}
      moreHref={
        shown < revealable && limit < CATALOG_SEARCH.maxLimit
          ? buyForMeHref("browse", {
              category: active,
              q: query,
              n: Math.min(limit + CATALOG_SEARCH.pageSize, CATALOG_SEARCH.maxLimit),
            })
          : null
      }
      clearSearchHref={query ? buyForMeHref("browse", { category: narrowed }) : null}
      pasteHref={pasteHref}
    />
  );
}

/**
 * `?category=` matched against the shelves we actually hold, or null.
 *
 * `resolveBrowseCategory` falls back to the fullest shelf when nothing matches,
 * which is right for browsing and wrong for a search: there, no category means
 * the whole catalogue, and a search silently pinned to "Headphones" because the
 * parameter was absent would hide most of its own matches.
 */
function matchCategory(
  raw: string | string[] | undefined,
  available: readonly { category: string }[],
): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const asked = (first ?? "").trim().toLowerCase();
  if (!asked) return null;
  return available.find((entry) => entry.category.trim().toLowerCase() === asked)?.category ?? null;
}

/**
 * How many rows this render may draw, from `?n=`.
 *
 * Clamped between one page and `maxLimit`, because every row costs a live
 * pricing calculation and this route is public. Anything unparseable is one
 * page, never an error: a truncated link should open the screen.
 */
function resolvePageSize(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const asked = Number.parseInt((first ?? "").trim(), 10);
  if (!Number.isFinite(asked)) return CATALOG_SEARCH.pageSize;
  return Math.min(Math.max(asked, CATALOG_SEARCH.pageSize), CATALOG_SEARCH.maxLimit);
}
