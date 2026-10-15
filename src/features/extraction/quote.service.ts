import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { logger } from "@/lib/logger";
import { REGION_TO_PRICING } from "@/features/extraction/url";
import { pickStoreShippingOption, storeShippingCurrencyOf, storeShippingOptionsOf } from "./store-shipping";
import { estimateWeightLbs } from "@/lib/pricing/weight-estimate";
import { WEIGHT_NOT_LISTED_MESSAGE } from "./resolvers/messages";
import type { FxOverride, PricingBreakdown, PricingCalculator } from "@/lib/pricing";
import { freightCheckPending, freightCorrectionPatch } from "@/features/pricing/freight-inspection";
import { reviveRegion } from "./region-revive";
import type { ExtractionResult, FreightCheck, Quote } from "./types";

export { storeShippingCurrencyOf };

export interface PriceOverrides {
  /** Customer-supplied gap-filler, honoured only when the snapshot has no price. */
  itemPriceUsd?: number;
  /**
   * The store shipping service the customer chose, by code. Resolved against
   * the snapshot's own option list — a code the snapshot does not offer is
   * ignored and the cheapest service is charged, so the browser can only ever
   * choose among the store's prices, never name one.
   */
  storeShippingCode?: string | null;
}

export interface PricedExtraction {
  pricing: PricingBreakdown | null;
  /** Why pricing is null (price missing, region unsupported, FX down…). */
  reason: string | null;
}

/**
 * The one rule for a customer-supplied price: it fills a gap, never replaces a
 * store price. Returns overrides only when the snapshot has no positive price
 * and the customer sent one; otherwise null and the snapshot is priced as is.
 * The preview route and order intake both go through here so the review page
 * and the order agree on when a customer's number counts.
 */
export function gapFillOverrides(result: ExtractionResult, itemPriceUsd: number | undefined): PriceOverrides | null {
  if (itemPriceUsd == null || !(itemPriceUsd > 0)) return null;
  const price = result.product.price;
  if (price != null && price > 0) return null;
  return { itemPriceUsd };
}

/**
 * Price a stored extraction on an already-loaded calculator. Callers that price
 * the same line twice (live and under a lock) load the calculator once and use
 * this directly so the admin knobs are read from the DB one time per request.
 *
 * `fx` is `null` for the live rate or a quote lock's frozen FX. It is required
 * so that no caller can forget which one it meant.
 */
export async function priceExtractionWith(
  calculator: PricingCalculator,
  extraction: ExtractionResult,
  quantity: number,
  overrides: PriceOverrides | null,
  fx: FxOverride | null,
): Promise<PricedExtraction> {
  const { product } = extraction;
  // Cached rows written before region inference have no country; the listed
  // currency answers it now (see region-revive.ts).
  const { country } = reviveRegion(extraction);

  const price = overrides?.itemPriceUsd ?? product.price;
  const currency = overrides?.itemPriceUsd != null ? "USD" : product.currency ?? "USD";

  if (price == null || price <= 0) return { pricing: null, reason: "Price could not be read from the product page." };
  if (!country) return { pricing: null, reason: "This store region is not supported yet." };

  // The freight inspector's corrections (category / weight / fixed item — never
  // money), applied only while the inspection matches this exact product and
  // fixed-freight table. Every scraped-product price goes through here, so the
  // review page, the quote lock and the order all see the same correction.
  const correction = extraction.freight_inspection
    ? freightCorrectionPatch(extraction.freight_inspection, product, calculator.activeFixedFreightItems.map((i) => i.id))
    : null;

  // No listed weight: a size-based estimate (a TV's screen diagonal) beats the
  // category default. The inspector's own weight, when it gave one, overrides
  // it through `correction` below; both are labelled "estimated".
  const estimate = product.weight_lbs == null
    ? estimateWeightLbs({ title: product.title, category: correction?.category ?? product.category })
    : null;

  // The store's own shipping to our warehouse, from the server snapshot: the
  // service the customer chose when the store offers several, else the
  // cheapest (`store_shipping`). Amazon always prices it as 0.
  const chosen = pickStoreShippingOption(product, overrides?.storeShippingCode);
  const namedOption = chosen ?? storeShippingOptionsOf(product).find((o) => o.cost === product.store_shipping) ?? null;
  const storeShipping = extraction.platform === "amazon" ? null : chosen ? chosen.cost : product.store_shipping ?? null;

  try {
    const pricing = await calculator.calculate({
      itemPrice: price,
      itemCurrency: currency,
      quantity,
      category: product.category ?? null,
      weightLbs: product.weight_lbs ?? estimate?.lbs ?? undefined,
      weightEstimated: product.weight_lbs == null && estimate != null,
      productTitle: product.title ?? undefined,
      region: REGION_TO_PRICING[country],
      // Listed in the product's currency even when the customer filled the price.
      storeShipping,
      storeShippingCurrency: chosen?.currency ?? storeShippingCurrencyOf(extraction, country),
      storeShippingOption: storeShipping != null && namedOption ? { code: namedOption.code, label: namedOption.label } : null,
      ...correction,
    }, fx);
    return { pricing, reason: null };
  } catch (err) {
    logger.warn("quote: pricing failed", { error: err instanceof Error ? err.message : String(err) });
    return { pricing: null, reason: err instanceof Error ? err.message : "Pricing is temporarily unavailable." };
  }
}

/**
 * Price a stored extraction. This is THE pricing entry point for anything
 * derived from a scrape — the quote endpoint, the review page preview, and
 * order creation all call it (or `priceExtractionWith`) with the same
 * server-owned snapshot, so the number the customer saw and the number they
 * are charged come from one function over one input.
 */
export async function priceExtraction(
  extraction: ExtractionResult,
  quantity: number,
  overrides: PriceOverrides | null,
  fx: FxOverride | null,
): Promise<PricedExtraction> {
  return priceExtractionWith(await loadPricingCalculator(), extraction, quantity, overrides, fx);
}

/**
 * The extraction as a customer may see it: the freight inspector's verdict is
 * internal (its effect is already in the price) and never leaves the server.
 */
export function customerExtraction<T extends ExtractionResult>(extraction: T): Omit<T, "freight_inspection"> {
  const copy: T = { ...reviveRegion(extraction) };
  delete copy.freight_inspection;
  return copy;
}

/**
 * What the customer is told about the freight check: non-null only while a
 * background check is running and has not gone stale. The verdict itself stays
 * internal (`customerExtraction`).
 */
export function freightCheckOf(extraction: ExtractionResult, now = Date.now()): FreightCheck | null {
  const inspection = extraction.freight_inspection;
  return inspection && freightCheckPending(inspection, now) ? { status: "checking", started_at: inspection.inspected_at } : null;
}

/**
 * The customer's notes, reconciled with the price they are looking at. The
 * chain writes "weight not listed" the moment it finds none; by the time the
 * quote renders, the inspector or a size estimate may have supplied one, and a
 * confident "85 lb" next to "weight not listed" reads as a contradiction
 * (2026-10-12). So the weight note is re-derived from the breakdown: a weight
 * we looked up is stated plainly like a listed one, with no note (customers
 * read "estimated" as "made up", 2026-10-15); a category placeholder keeps the
 * original warning; a flat-rate group never charged by weight, so the note is
 * dropped.
 */
export function customerMessages(messages: readonly string[], pricing: PricingBreakdown | null, checking = false): string[] {
  const rest = messages.filter((m) => m !== WEIGHT_NOT_LISTED_MESSAGE);
  // The receipt says the weight is being checked; a weight note now would be stale in seconds.
  if (checking) return rest;
  if (!pricing) return messages.includes(WEIGHT_NOT_LISTED_MESSAGE) ? [...rest, WEIGHT_NOT_LISTED_MESSAGE] : rest;
  if (pricing.pricing_method !== "weight_expression") return rest;
  if (pricing.weight_source === "default") return [...rest, WEIGHT_NOT_LISTED_MESSAGE];
  return rest;
}

/** A live-rate quote with no lock. The customer-facing routes use `quoteForViewer` instead. */
export async function buildQuote(
  extraction: ExtractionResult & { extraction_cache_id: string | null },
  quantity = 1,
): Promise<Quote> {
  const { pricing, reason } = await priceExtraction(extraction, quantity, null, null);
  const customer = customerExtraction(extraction);
  const freightCheck = freightCheckOf(extraction);
  return { ...customer, messages: customerMessages(customer.messages, pricing, freightCheck != null), pricing, pricing_unavailable_reason: reason, freight_check: freightCheck };
}
