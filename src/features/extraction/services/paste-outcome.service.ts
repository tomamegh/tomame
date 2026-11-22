import "server-only";

import { findOpenAssistedRequest, insertPasteAssistedRequest } from "@/db/queries/assisted-requests";
import { findCatalogProductForPaste, type CatalogFallbackRow } from "@/db/queries/catalog";
import { getExtractionById, getQuoteFacts, upsertExtractionCache } from "@/db/queries/extraction-cache";
import {
  listUnsettledPastes,
  readyFromCache,
  setPasteOutcome,
  type ExtractionJobRow,
  type PasteOutcome,
} from "@/db/queries/extraction-requests";
import { QUOTE_VALID_HOURS } from "@/config/constants";
import { logger } from "@/lib/logger";
import { emptyProduct } from "../scrapers/types";
import { amazonAsinOf, ebayItemIdOf, hashUrl } from "../url";
import type { ExtractionResult } from "../types";
import type { PasteFinishedResult } from "./paste-notify.service";
import { outcomeClock } from "./paste-quote-clock";

/**
 * How a paste ended for the customer (110), decided once its job has settled.
 *
 * A priced read is `priced`. A read with no price is never left as a dead end:
 * the catalogue's last check of the SAME product answers it (`priced_from_cache`,
 * labelled with its date), and failing that a buyer task is opened so a person
 * quotes it by hand (`manual_quote`). A failed paste never starts the 24-hour
 * free-quote clock and is never called a lapsed quote.
 */

export const MANUAL_QUOTE_DESCRIPTION = "We couldn't price this link automatically. Quote it by hand and reply in the customer's chat.";

/** Metadata key on a product priced from the catalogue: the customer sees the date it was checked. */
export const PRICED_FROM_KEY = "priced_from";

export interface PricedFrom {
  kind: "catalog";
  catalog_product_id: string;
  checked_at: string;
}

export function pricedFromOf(result: Pick<ExtractionResult, "product"> | null | undefined): PricedFrom | null {
  const raw = result?.product?.metadata?.[PRICED_FROM_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return r.kind === "catalog" && typeof r.checked_at === "string" && typeof r.catalog_product_id === "string"
    ? { kind: "catalog", catalog_product_id: r.catalog_product_id, checked_at: r.checked_at }
    : null;
}

/**
 * Record the outcome of a settled first read, and turn a no-price ending into a
 * cached price or a buyer task. Returns what the customer should now be told.
 * Never throws: a failure here leaves `outcome` null for the sweep to retry.
 */
export async function settlePasteOutcome(row: ExtractionJobRow, finished: PasteFinishedResult, now = new Date()): Promise<PasteFinishedResult> {
  try {
    if (finished.status === "ready") {
      const facts = (await getQuoteFacts([finished.extractionCacheId])).get(finished.extractionCacheId);
      if (facts?.usable && facts.priced) {
        const snapshot = await getExtractionById(finished.extractionCacheId);
        const outcome: PasteOutcome = pricedFromOf(snapshot?.result) ? "priced_from_cache" : "priced";
        await setPasteOutcome(row.id, outcome, outcomeClock(row, outcome, now));
        return finished;
      }
    }

    const fromCache = await priceFromCatalog(row, now);
    if (fromCache) {
      await readyFromCache(row.id, fromCache);
      await setPasteOutcome(row.id, "priced_from_cache", outcomeClock(row, "priced_from_cache", now));
      logger.info("paste: priced from the catalogue's last check", { id: row.id, url: row.product_url });
      return { status: "ready", extractionCacheId: fromCache };
    }

    await openManualQuote(row);
    await setPasteOutcome(row.id, "manual_quote", now.toISOString());
    return { status: "failed" };
  } catch (error) {
    logger.error("paste: could not settle the outcome", { id: row.id, error: error instanceof Error ? error.message : String(error) });
    return finished;
  }
}

/** The sweep's safety net: pastes that settled without an outcome (the give-up sweep, a lost inline settle). */
export async function settleUnsettledPastes(limit = 10): Promise<number> {
  const rows = await listUnsettledPastes(30 * 60_000, limit);
  for (const row of rows) {
    await settlePasteOutcome(row, row.status === "ready" && row.extraction_cache_id ? { status: "ready", extractionCacheId: row.extraction_cache_id } : { status: "failed" });
  }
  return rows.length;
}

async function openManualQuote(row: ExtractionJobRow): Promise<void> {
  // A customer who already asked a buyer about this link has a task; a second is noise.
  const existing = await findOpenAssistedRequest({ userId: row.user_id, sessionId: row.session_id, productUrl: row.product_url });
  if (existing) return;
  await insertPasteAssistedRequest({
    userId: row.user_id,
    sessionId: row.session_id,
    extractionRequestId: row.id,
    productUrl: row.product_url,
    description: MANUAL_QUOTE_DESCRIPTION,
  });
}

/**
 * The catalogue's last check of this exact product, written as the paste's
 * quote. Only a row the pricing engine could already price (`landed_ghs`)
 * qualifies, so the quote it makes is payable. Returns the cache id, or null.
 */
async function priceFromCatalog(row: ExtractionJobRow, now: Date): Promise<string | null> {
  const store = storeOf(row.product_url);
  const hit = await findCatalogProductForPaste({ urlHash: row.url_hash, store, externalId: externalIdOf(row.product_url, store) });
  if (!hit || hit.price_usd == null || !(Number(hit.price_usd) > 0) || hit.landed_ghs == null) return null;
  return upsertExtractionCache({
    urlHash: row.url_hash || hashUrl(row.product_url),
    productUrl: row.product_url,
    result: catalogResult(hit, now),
    complete: true,
    source: null,
    requestedBy: row.user_id,
    // Lives as long as the free quote: a re-read would only fail again and lose this price.
    expiresAt: new Date(now.getTime() + QUOTE_VALID_HOURS * 3_600_000).toISOString(),
  });
}

/** A product read from the catalogue's row, marked with when that row was last checked. */
export function catalogResult(hit: CatalogFallbackRow, now: Date): ExtractionResult {
  const product = {
    ...emptyProduct(),
    title: hit.title,
    image: hit.image_url,
    images: hit.image_url ? [hit.image_url] : [],
    price: Number(hit.price_usd),
    currency: (hit.currency ?? "USD").toUpperCase(),
    category: (hit.category as ExtractionResult["product"]["category"]) ?? null,
    weight_lbs: hit.weight_lbs != null && Number(hit.weight_lbs) > 0 ? Number(hit.weight_lbs) : null,
    metadata: { [PRICED_FROM_KEY]: { kind: "catalog", catalog_product_id: hit.id, checked_at: hit.last_seen_at } satisfies PricedFrom },
  };
  const checked = new Date(hit.last_seen_at);
  const day = Number.isFinite(checked.getTime())
    ? checked.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : "recently";
  const message = `We couldn't read the store just now, so this is the price we last checked on ${day}. We confirm it before we buy.`;
  return {
    extraction_attempted: true,
    extraction_success: true,
    platform: hit.store,
    country: "USA",
    product,
    messages: [message],
    errors: [message],
    source: null,
    sources: [],
    confidence: {},
    fetched_at: now.toISOString(),
  };
}

function storeOf(url: string): string {
  if (amazonAsinOf(url)) return "amazon";
  if (ebayItemIdOf(url)) return "ebay";
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function externalIdOf(url: string, store: string): string | null {
  if (store === "amazon") return amazonAsinOf(url);
  if (store === "ebay") return ebayItemIdOf(url);
  return null;
}
