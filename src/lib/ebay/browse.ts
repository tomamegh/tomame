import { logger } from "@/lib/logger";
import { ebayConfig, type EbayConfig } from "./config";
import { getEbayAppToken } from "./client";

/**
 * eBay Browse API — the store's own record of a listing: price, condition,
 * seller, category path, item specifics, images, and the shipping services
 * offered to a destination with their costs and delivery estimates. Free, a
 * few hundred milliseconds, and exact where a scraped page is a guess.
 * https://developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItem
 */

export interface EbayMoney {
  value?: string;
  currency?: string;
}

export interface EbayShippingOption {
  shippingServiceCode?: string;
  shippingCarrierCode?: string;
  type?: string;
  shippingCost?: EbayMoney;
  additionalShippingCostPerUnit?: EbayMoney;
  minEstimatedDeliveryDate?: string;
  maxEstimatedDeliveryDate?: string;
  shippingCostType?: string;
  shipToLocationUsedForEstimate?: { country?: string; postalCode?: string };
}

export interface EbayItem {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  shortDescription?: string;
  price?: EbayMoney;
  marketingPrice?: { originalPrice?: EbayMoney; discountPercentage?: string };
  categoryPath?: string;
  categoryId?: string;
  condition?: string;
  conditionId?: string;
  itemLocation?: { city?: string; stateOrProvince?: string; postalCode?: string; country?: string };
  image?: { imageUrl?: string };
  additionalImages?: Array<{ imageUrl?: string }>;
  brand?: string;
  color?: string;
  material?: string;
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
  estimatedAvailabilities?: Array<{ estimatedAvailabilityStatus?: string; estimatedRemainingQuantity?: number }>;
  shippingOptions?: EbayShippingOption[];
  shipToLocations?: { regionIncluded?: Array<{ regionName?: string; regionType?: string }>; regionExcluded?: Array<{ regionName?: string }> };
  localizedAspects?: Array<{ name?: string; value?: string; type?: string }>;
  itemWebUrl?: string;
  primaryItemGroup?: { itemGroupId?: string };
  [key: string]: unknown;
}

interface EbayError {
  errorId?: number;
  message?: string;
  parameters?: Array<{ name?: string; value?: string }>;
}

export interface EbayShipTo {
  /** ISO 3166 alpha-2, e.g. "US". */
  country: string;
  /** Postal code at the destination; null lets eBay assume the country's default. */
  zip: string | null;
}

export interface FetchEbayItemOptions {
  /** `EBAY_US`, `EBAY_GB`, … */
  marketplace: string;
  shipTo: EbayShipTo;
  /** A multi-variation listing's chosen variant (`?var=` on the item URL). */
  variantId?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const ITEM_GROUP_ERROR = 11006;

function headers(token: string, opts: FetchEbayItemOptions): Record<string, string> {
  const ctx = opts.shipTo.zip
    ? `country=${opts.shipTo.country},zip=${opts.shipTo.zip}`
    : `country=${opts.shipTo.country}`;
  return {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": opts.marketplace,
    "X-EBAY-C-ENDUSERCTX": `contextualLocation=${encodeURIComponent(ctx)}`,
    Accept: "application/json",
  };
}

async function get<T>(url: string, token: string, opts: FetchEbayItemOptions): Promise<{ status: number; body: T | null; errors: EbayError[] }> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8_000);
  const res = await fetch(url, {
    headers: headers(token, opts),
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  });
  const body = (await res.json().catch(() => null)) as (T & { errors?: EbayError[] }) | null;
  return { status: res.status, body: res.ok ? body : null, errors: body?.errors ?? [] };
}

function pickVariant(items: EbayItem[], variantId: string | null | undefined): EbayItem | null {
  if (items.length === 0) return null;
  if (variantId) {
    const exact = items.find((i) => i.itemId?.endsWith(`|${variantId}`));
    if (exact) return exact;
  }
  const inStock = items.find((i) => i.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus === "IN_STOCK");
  return inStock ?? items[0] ?? null;
}

/**
 * The listing behind an item URL. A multi-variation listing (colour, size)
 * answers the legacy-id lookup with error 11006 and an item-group id; the
 * group's items are then read and the URL's `var` (else the first in-stock
 * variant) is taken. Null on any failure — the chain falls through.
 */
export async function fetchEbayItem(legacyItemId: string, opts: FetchEbayItemOptions, config: EbayConfig | null = ebayConfig()): Promise<EbayItem | null> {
  if (!config || !/^\d{9,}$/.test(legacyItemId)) return null;
  const token = await getEbayAppToken(config);
  if (!token) return null;
  const base = `${config.apiBase}/buy/browse/v1/item`;
  const t0 = Date.now();
  try {
    if (opts.variantId && /^\d{6,}$/.test(opts.variantId)) {
      const direct = await get<EbayItem>(`${base}/${encodeURIComponent(`v1|${legacyItemId}|${opts.variantId}`)}`, token, opts);
      if (direct.body?.itemId) {
        logger.info("ebay: item fetched", { legacyItemId, variant: opts.variantId, ms: Date.now() - t0 });
        return direct.body;
      }
    }
    const byLegacy = await get<EbayItem>(`${base}/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(legacyItemId)}`, token, opts);
    if (byLegacy.body?.itemId) {
      logger.info("ebay: item fetched", { legacyItemId, ms: Date.now() - t0 });
      return byLegacy.body;
    }
    const groupError = byLegacy.errors.find((e) => e.errorId === ITEM_GROUP_ERROR);
    if (groupError) {
      const group = await get<{ items?: EbayItem[] }>(`${base}/get_items_by_item_group?item_group_id=${encodeURIComponent(legacyItemId)}`, token, opts);
      const chosen = pickVariant(group.body?.items ?? [], opts.variantId);
      logger.info("ebay: item group fetched", { legacyItemId, variants: group.body?.items?.length ?? 0, chose: chosen?.itemId ?? null, ms: Date.now() - t0 });
      return chosen;
    }
    logger.warn("ebay: item lookup failed", { legacyItemId, status: byLegacy.status, errors: byLegacy.errors.slice(0, 2).map((e) => `${e.errorId}: ${e.message}`), ms: Date.now() - t0 });
    return null;
  } catch (err) {
    if (!opts.signal?.aborted) logger.warn("ebay: item request failed", { legacyItemId, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
    return null;
  }
}
