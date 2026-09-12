import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listWatches } from "@/features/watches/services/watches.service";
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
import {
  getCachedExtractionByHash,
  getExtractionById,
} from "@/db/queries/extraction-cache";
import { listRegions, type RegionRow } from "@/db/queries/regions";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { whatsappHref } from "@/components/layout/marketing/links";
import { priceUnderExistingLock } from "@/features/quotes/services/quote-lock.service";
import { loadQuoteConstants, QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import type { QuoteConstants, Viewer } from "@/features/quotes/types";
import { describeJourney } from "@/features/orders/services/journey-stage";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import type { ExtractionResult } from "@/features/extraction/types";
import type {
  HomeAskBuyer,
  HomeJourney,
  HomeLanes,
  HomeReceipt,
  HomeViewModel,
  TimeOfDay,
} from "../types";

/** How many journeys the Home list shows before "All journeys →" takes over. */
export const HOME_JOURNEY_LIMIT = 4;

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

  const [movingCount, orders, latestPaste, regions, settings, watchList, quoteConstants] =
    await Promise.all([
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
      // `regions` and `site_settings` are public, admin-owned content, read
      // through the cookieless anon client inside their own query modules.
      degrade(listRegions(), [] as RegionRow[], "regions"),
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
    ]);

  return {
    greeting: {
      firstName: user.profile.first_name?.trim() || null,
      timeOfDay: timeOfDayFor(new Date()),
      movingCount,
    },
    journeys: toJourneys(orders),
    receipt: await buildReceipt(latestPaste, viewer),
    lanes: buildLanes(regions),
    askBuyer: buildAskBuyer(settings),
    watches: watchList,
    rateLockHours: quoteConstants?.rate_lock_hours ?? null,
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

  const { pricing, reason } = await priceUnderExistingLock({
    viewer,
    extraction: snapshot.result,
    extractionCacheId: snapshot.id,
    quantity: 1,
    overrides: null,
  });

  return {
    productUrl: paste.product_url,
    storeHost: hostOf(paste.product_url),
    pastedAt: paste.updated_at,
    productName: snapshot.result.product.title,
    productImageUrl: snapshot.result.product.image,
    pricing,
    pricingUnavailableReason: reason,
    extractionCacheId: snapshot.id,
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

// ── Lanes ────────────────────────────────────────────────────────────────────

/**
 * Where the "Shipping from …" card sends a customer whose lane is not open.
 *
 * `#stores` is the Where-we-buy section that already renders one `WaitlistForm`
 * per unopened lane (Phase 1). No new endpoint is invented here, and no second
 * form is built.
 */
export const LANE_WAITLIST_HREF = "/where-we-buy#stores";

/**
 * How each lane is named in a "Shipping from …" phrase. The article is baked
 * in per code because English does not agree: "from the USA", "from the UK",
 * but "from China".
 */
const REGION_SUBJECT: Readonly<Record<string, string>> = {
  USA: "the USA",
  UK: "the UK",
  CHINA: "China",
};

/** How each lane qualifies a shop: "Any US store", "Any Chinese store". */
const REGION_ADJECTIVE: Readonly<Record<string, string>> = {
  USA: "US",
  UK: "UK",
  CHINA: "Chinese",
};

/** Bare label for the waitlist clause: "UK and China lanes are coming soon". */
const REGION_SHORT_NAME: Readonly<Record<string, string>> = {
  USA: "USA",
  UK: "UK",
  CHINA: "China",
};

/**
 * The lane card's every word, derived from `regions`.
 *
 * Nothing here is a literal the database could contradict: the transit band is
 * the live lanes' own `transit_days_min`/`max`, and the "coming soon" clause is
 * whichever rows are `status='soon'` — two lanes, one lane, or no clause at all.
 *
 * Returns null when no lane is `live`. Only a live lane is purchasable
 * (CLAUDE.md), so with none open there is no truthful "shipping from" claim to
 * make and the card should not appear at all.
 *
 * Pure: takes rows, returns strings. Tested directly.
 */
export function buildLanes(regions: readonly RegionRow[]): HomeLanes | null {
  const live = regions.filter((region) => region.status === "live");
  if (live.length === 0) return null;

  const soon = regions.filter((region) => region.status === "soon");

  const heading = `Shipping from ${joinWith(
    live.map((region) => labelOf(region, REGION_SUBJECT)),
    "and",
  )}`;

  // "or", not "and": one parcel ships on one lane, so "Any US or UK store" is
  // the accurate offer. "Any US and UK store" describes a shop that is both.
  const stores = joinWith(
    live.map((region) => labelOf(region, REGION_ADJECTIVE)),
    "or",
  );
  const band = transitBandAcross(live);
  const sentences = [
    band
      ? `Any ${stores} store, ${band} to Accra.`
      : `Any ${stores} store, delivered to your door in Accra.`,
  ];

  let waitlist: HomeLanes["waitlist"] = null;
  if (soon.length > 0) {
    const names = soon.map((region) => labelOf(region, REGION_SHORT_NAME));
    sentences.push(
      names.length === 1
        ? `The ${names[0]} lane is coming soon — get notified.`
        : `${joinWith(names, "and")} lanes are coming soon — get notified.`,
    );
    waitlist = {
      label: `Join the ${names.join(" / ")} waitlist`,
      href: LANE_WAITLIST_HREF,
    };
  }

  return { heading, body: sentences.join(" "), waitlist };
}

/**
 * "14–18 days" across every live lane, widest honest span.
 *
 * With one open lane this is simply that lane's band. With two it is the union,
 * because the sentence covers both — never an average, which would describe a
 * timeline no parcel actually has. Null when no lane publishes a band, and the
 * caller drops the clause rather than guessing.
 */
function transitBandAcross(regions: readonly RegionRow[]): string | null {
  const mins = regions
    .map((region) => region.transit_days_min)
    .filter((value): value is number => typeof value === "number");
  const maxes = regions
    .map((region) => region.transit_days_max)
    .filter((value): value is number => typeof value === "number");

  const min = mins.length > 0 ? Math.min(...mins) : null;
  const max = maxes.length > 0 ? Math.max(...maxes) : null;

  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

/** Copy label for a lane, falling back to the admin's own `regions.name`. */
function labelOf(
  region: RegionRow,
  table: Readonly<Record<string, string>>,
): string {
  return table[region.code] ?? region.name;
}

/** "USA", "USA and UK", "USA, UK and China" — or the same list with "or". */
function joinWith(parts: readonly string[], conjunction: "and" | "or"): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${conjunction} ${parts[parts.length - 1]}`;
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
