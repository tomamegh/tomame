import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listWatches } from "@/features/watches/services/watches.service";
import { attachCovers, listPublishedCars } from "@/features/cars/services/cars.service";

import type { WatchListResponse } from "@/features/watches/types";
import {
  countMovingOrders,
  getRecentOrdersForUser,
  type RecentOrderRow,
} from "@/db/queries/orders";
import {
  getLatestExtractionRequest,
  type ExtractionRequestRow,
} from "@/db/queries/extraction-requests";
import { listOpenAssistedRequestsByUrl, type OpenAssistedRequestSummary } from "@/db/queries/assisted-requests";
import { getReceiptFulfilment, NO_FULFILMENT } from "@/db/queries/receipt-state";
import {
  getCachedExtractionByHash,
  getExtractionById,
} from "@/db/queries/extraction-cache";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import {
  listBrowsableCategories,
  listCatalogDeals,
  type CatalogSearchResponse,
} from "@/features/catalog/services/catalog-search.service";
import type { CatalogCategoryCount } from "@/db/queries/catalog";
import type { CatalogProduct } from "@/features/catalog/types";
import { buyForMeHref } from "@/features/extraction/components/buy-for-me-mode";
import { whatsappHref } from "@/components/layout/marketing/links";
import { priceUnderExistingLock } from "@/features/quotes/services/quote-lock.service";
import { loadQuoteConstants, QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import type { QuoteConstants, Viewer } from "@/features/quotes/types";
import { describeJourney } from "@/features/orders/services/journey-stage";
import { getBag } from "@/features/bag/services/bag.service";
import type { BagView } from "@/features/bag/types";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import type { ExtractionResult } from "@/features/extraction/types";
import type {
  HomeAskBuyer,
  HomeCars,
  HomeDealCategory,
  HomeDeals,
  HomeFreightBox,
  HomeJourney,
  HomeReceipt,
  HomeViewModel,
  TimeOfDay,
} from "../types";

/** How many journeys the Home list shows before "All journeys →" takes over. */
export const HOME_JOURNEY_LIMIT = 4;

/**
 * How many pre-priced products the Home shelf shows.
 *
 * Eight, because the grid is four-up at `xl` and three-up at `lg`: eight fills
 * two clean rows on the widest layout and never leaves a single orphan card on
 * a row of its own at the narrower ones. Everything past it lives one press
 * away in browse mode, which is built for a long list and this screen is not.
 */
export const HOME_DEALS_LIMIT = 8;

/** Shelves offered as pills above the Home grid, largest first. */
export const HOME_DEAL_CATEGORY_LIMIT = 6;

/**
 * How many cars the Home rail carries.
 *
 * Six, which is two full turns of a phone's ~1.15-card window and one turn plus
 * a peek of the desktop's three. The rail is an advert for the forecourt, not
 * the forecourt: everything past six lives at `/app/cars`, which is built for
 * the whole list and is one press away from the shelf's own heading.
 */
export const HOME_CARS_LIMIT = 6;

/**
 * Everything the Home screen renders, in one server-side read.
 *
 * Returns null when there is no session — the page redirects; this service does
 * not know about routing. All user-scoped reads go through the cookie-bound
 * client so RLS decides what is visible; the only service-role reads are of
 * `extraction_cache`, which is shared, product-keyed data with RLS enabled and
 * no policies by design, and is therefore unreachable from a customer client.
 *
 * `quoteSessionId` is the page's `tm_quote_session` cookie (or null). Together
 * with the signed-in user it names the Viewer whose EXISTING rate lock prices
 * the receipt — Home never mints a lock.
 */
export async function getHomeView(quoteSessionId: string | null = null): Promise<HomeViewModel | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const viewer: Viewer = { userId: user.id, sessionId: quoteSessionId };
  const client = await createClient();

  const [
    movingCount,
    orders,
    latestPaste,
    settings,
    watchList,
    quoteConstants,
    bag,
    deals,
    categories,
    cars,
  ] = await Promise.all([
      degrade(countMovingOrders(client, user.id), 0, "moving order count"),
      degrade(
        getRecentOrdersForUser(client, user.id, HOME_JOURNEY_LIMIT + 2),
        [] as RecentOrderRow[],
        "recent orders",
      ),
      degrade(
        getLatestExtractionRequest(client, user.id),
        null as ExtractionRequestRow | null,
        "latest extraction request",
      ),
      // `site_settings` is public, admin-owned content, read through the
      // cookieless anon client inside its own query module.
      degrade(
        getSiteSettingsMap(),
        {} as Record<string, unknown>,
        "site settings",
      ),
      // The Home card shows the first few; the full list lives at /app/watches.
      degrade(
        listWatches(user.id),
        { watches: [], watching_count: 0, retired: [] } as WatchListResponse,
        "price watches",
      ),
      // Backs the "Rate locked Nh" trust chip: the same constant the lock is
      // minted with, so the copy and the behaviour cannot drift. A flaky read
      // drops the chip; a MISSING constant (deploy before migrate) surfaces.
      degrade(loadQuoteConstants(), null as QuoteConstants | null, "quote constants"),
      // The freight-box card is the open bag's first box. `getBag` is the only
      // thing that knows how the lines packed, so the card reads the same
      // object the bag screen renders — no second, drifting calculation.
      degrade(getBag(viewer), null as BagView | null, "bag"),
      // THE SHOP HALF OF HOME. Both reads are of `catalog_products`, which is
      // shared, store-public data with its own public read policy — nothing
      // here is scoped to this customer, and nothing here is cached per user.
      // They degrade to empty rather than throwing: a catalogue outage should
      // cost the shelf, not the screen somebody's parcels are on.
      degrade(
        listCatalogDeals({ limit: HOME_DEALS_LIMIT }),
        { query: "", count: 0, total: 0, results: [] } as CatalogSearchResponse,
        "catalogue deals",
      ),
      degrade(listBrowsableCategories(), [] as CatalogCategoryCount[], "catalogue categories"),
      // THE CAR SHELF. `car_listings` is admin-owned public content, published
      // or not — nothing here is scoped to this customer. It degrades to null,
      // which the rail reads as "draw nothing at all": a shelf that cannot be
      // read must look exactly like a shelf with nothing on it, because the one
      // thing that must never appear on Home is a car we cannot vouch for.
      degrade(loadHomeCars(), null as HomeCars | null, "cars en route"),
    ]);

  return {
    greeting: {
      firstName: user.profile.first_name?.trim() || null,
      timeOfDay: timeOfDayFor(new Date()),
      movingCount,
    },
    journeys: toJourneys(orders),
    receipt: await buildReceipt(latestPaste, viewer),
    deals: buildDeals(deals.results, categories),
    cars,
    askBuyer: buildAskBuyer(settings),
    watches: watchList,
    rateLockHours: quoteConstants?.rate_lock_hours ?? null,
    freightBox: buildFreightBox(bag),
    catalogueCount: countCatalogue(categories),
  };
}

// ── Cars ─────────────────────────────────────────────────────────────────────

/**
 * The published cars, with the one photograph a card shows.
 *
 * NULL WHEN NOTHING IS PUBLISHED, which is the same answer a failed read gives,
 * and deliberately so: the rail renders nothing at all in either case. There is
 * no placeholder car and no "cars coming soon" tile, for the reason `buildDeals`
 * gives about products and more so — a made-up product on a price screen is a
 * made-up price, and a made-up CAR is a made-up six-figure price beside a
 * photograph of a vehicle that does not exist.
 *
 * `total` is every published listing, not the six on the rail, so the shelf's
 * link can say "See all 14 cars". That is a real count of things an admin
 * published, not the "how much did we scrape" figure `DealsShelf` deliberately
 * stopped printing.
 *
 * `attachCovers` never throws and never drops a listing: a car whose photo read
 * failed comes back with `cover: null` and its card draws the placeholder
 * glyph, rather than the whole rail disappearing over one storage hiccup.
 */
export async function loadHomeCars(): Promise<HomeCars | null> {
  const { cars, total } = await listPublishedCars({ limit: HOME_CARS_LIMIT });
  if (cars.length === 0) return null;
  return { cars: await attachCovers(cars), total };
}

// ── Freight box ──────────────────────────────────────────────────────────────

/**
 * The bag's first consolidation box, or null when there is no bag to show.
 *
 * "First" is the box the earliest line landed in — the one the mock draws. A
 * bag spanning two regions has a second box; the card links to `/app/bag`,
 * which shows them all, rather than stacking cards on Home.
 */
export function buildFreightBox(bag: BagView | null): HomeFreightBox | null {
  const box = bag?.boxes[0];
  if (!box) return null;
  return {
    label: box.label,
    departsAt: box.departs_at,
    fillPct: box.fill_pct,
    weightLbs: box.weight_lbs,
    capacityLbs: box.capacity_lbs,
    itemCount: box.item_count,
    unweighedLineCount: box.unweighed_line_count,
    marginalSavingGhs: box.marginal_saving_ghs,
    href: "/app/bag",
  };
}

// ── Greeting ─────────────────────────────────────────────────────────────────

/**
 * Ghana observes GMT all year and never shifts for daylight saving, so the
 * server's UTC hour is also the customer's local hour. No timezone library and
 * no client-side clock are needed.
 */
export function timeOfDayFor(now: Date): TimeOfDay {
  const hour = now.getUTCHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

// ── Journeys ─────────────────────────────────────────────────────────────────

/**
 * Cancelled orders are dropped: the card is "journeys in motion", and a
 * cancelled order has no position on the track. Delivered ones stay — a
 * completed track is a real state, not filler.
 */
function toJourneys(orders: RecentOrderRow[]): HomeJourney[] {
  return orders
    .filter((order) => order.status !== "cancelled")
    .slice(0, HOME_JOURNEY_LIMIT)
    .map((order) => ({
      id: order.id,
      productName: order.product_name,
      productUrl: order.product_url,
      status: order.status,
      stage: describeJourney({
        status: order.status,
        estimatedDeliveryDate: order.estimated_delivery_date,
      }),
      totalGhs: totalGhsOf(order),
      createdAt: order.created_at,
    }));
}

function totalGhsOf(order: RecentOrderRow): number | null {
  const total = order.pricing?.total_ghs;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

// ── Live receipt ─────────────────────────────────────────────────────────────

/**
 * The last link this customer pasted, priced under the viewer's existing rate
 * lock (lower of locked and live), or live when they hold none. Never mints:
 * looking at Home is not asking for a quote. `rate_locked_until` rides along on
 * the breakdown so the card can show it.
 *
 * `extraction_cache` rows are pruned on a TTL (pg_cron), and the FK is
 * ON DELETE SET NULL, so a paste record can outlive its extraction. Two
 * fallbacks, in order: read the snapshot by id, then re-read by `url_hash` in
 * case the product has since been re-extracted by anyone. If neither exists
 * there is nothing truthful to show, so the card renders nothing — it never
 * crashes and never invents a price.
 */
async function buildReceipt(
  paste: ExtractionRequestRow | null,
  viewer: Viewer,
): Promise<HomeReceipt | null> {
  if (!paste) return null;

  const snapshot = await loadExtraction(paste);
  if (!snapshot) return null;

  const [{ pricing, reason }, assisted, fulfilment] = await Promise.all([
    priceUnderExistingLock({
      viewer,
      extraction: snapshot.result,
      extractionCacheId: snapshot.id,
      quantity: 1,
      overrides: null,
    }),
    // Already in a buyer's hands? The card then shows that instead of "Try
    // again" and "Describe it" — the same closure the paste list and bag apply.
    degrade(
      listOpenAssistedRequestsByUrl(viewer, [paste.product_url]),
      new Map<string, OpenAssistedRequestSummary>(),
      "assisted requests",
    ),
    // Already bought, or already in the bag? Without this the card offered
    // "Add to bag" for a product the customer had paid for.
    degrade(getReceiptFulfilment(viewer, snapshot.id), NO_FULFILMENT, "receipt fulfilment"),
  ]);

  // AN ORDER IS THE SETTLED FACT, so it replaces the live quote outright.
  // `pricing` above is re-derived on every render under the current rate lock,
  // which is the right thing for something the customer has not bought — and
  // the wrong thing for something they have, where the only honest figure is
  // what they were charged. The order carries its own stored breakdown.
  const settled = fulfilment.kind === "ordered" ? fulfilment.pricing : null;

  return {
    productUrl: paste.product_url,
    storeHost: hostOf(paste.product_url),
    pastedAt: paste.updated_at,
    productName: snapshot.result.product.title,
    productImageUrl: snapshot.result.product.image,
    pricing: settled ?? pricing,
    // A paid order always has a price, so a "we could not price this" reason
    // from the live quote must not survive onto a receipt that shows one.
    pricingUnavailableReason: settled ? null : reason,
    extractionCacheId: snapshot.id,
    assistedOpen: assisted.has(paste.product_url),
    fulfilment,
  };
}

async function loadExtraction(
  paste: ExtractionRequestRow,
): Promise<{ id: string; result: ExtractionResult } | null> {
  if (paste.extraction_cache_id) {
    const byId = await getExtractionById(paste.extraction_cache_id);
    if (byId) return { id: byId.id, result: byId.result };
  }
  return getCachedExtractionByHash(paste.url_hash);
}

/** "https://www.amazon.com/dp/X" → "amazon.com". Never throws on junk input. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

// ── Deals ────────────────────────────────────────────────────────────────────

/**
 * "Hot right now" — the shelf, its pills and the address of the full catalogue.
 *
 * Pure: takes the priced rows and the category counts, returns what the section
 * prints. Tested directly.
 *
 * Returns null when there is nothing priced to show. That is deliberately not
 * the same as "the catalogue is empty": a catalogue full of rows the engine
 * declined has nothing honest to put on a shelf whose whole promise is the
 * cedi figure, so the section does not appear and the hero's search — which
 * works on titles, not prices — carries on offering the same products.
 *
 * NO PILL EVER OPENS ONTO NOTHING. The categories are the ones the catalogue
 * actually holds (`catalog_categories`, derived not declared), so a shelf
 * exists here precisely because products are sitting in it.
 */
export function buildDeals(
  products: readonly CatalogProduct[],
  categories: readonly CatalogCategoryCount[],
): HomeDeals | null {
  if (products.length === 0) return null;

  return {
    products: [...products],
    categories: categories.slice(0, HOME_DEAL_CATEGORY_LIMIT).map(toDealCategory),
    browseHref: buyForMeHref("browse"),
  };
}

function toDealCategory(entry: CatalogCategoryCount): HomeDealCategory {
  return {
    label: entry.category,
    count: entry.count,
    href: buyForMeHref("browse", { category: entry.category }),
  };
}

/**
 * Everything the catalogue holds. Summed from the per-category counts rather
 * than counted again: `catalog_categories` is a GROUP BY with no row ceiling,
 * and a second `count(*)` over the table would be a second round trip to learn
 * something the first one already said.
 */
export function countCatalogue(categories: readonly CatalogCategoryCount[]): number {
  return categories.reduce((sum, entry) => sum + entry.count, 0);
}

// ── Ask a buyer ──────────────────────────────────────────────────────────────

/**
 * The human-contact card's data.
 *
 * `whatsappHref` is deliberately nullable rather than defaulted: a `wa.me` link
 * built from no number is a dead link, and the copy promising "a real person
 * answers on WhatsApp" would be false. The component reads the null and swaps
 * both the destination and the sentence — see `ask-buyer-card.tsx`.
 */
export function buildAskBuyer(settings: Record<string, unknown>): HomeAskBuyer {
  return {
    whatsappHref: whatsappHref(readString(settings.whatsapp_number)),
    supportHours: readString(settings.support_hours),
  };
}

/** `site_settings.value` is JSONB; anything not a non-empty string is absent. */
function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── Failure policy ───────────────────────────────────────────────────────────

/**
 * A missing table is a deployment error and must be loud (handoff gotcha 8):
 * rethrow it so the page fails rather than rendering a silently empty Home. So
 * is a missing seeded quote constant — the "Rate locked Nh" chip must go red,
 * not quietly disappear. Any other failure degrades to a fallback with a logged
 * warning — one flaky read should not take the whole screen down.
 */
async function degrade<T>(
  work: Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isSchemaMissingError(error) || error instanceof QuoteConstantsMissingError) throw error;
    logger.warn(`home: ${label} failed`, { error: errorMessage(error) });
    return fallback;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}
