import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { logger } from "@/lib/logger";
import { REGION_TO_PRICING } from "@/features/extraction/url";
import type { FxOverride, PricingBreakdown, PricingCalculator } from "@/lib/pricing";
import type { ExtractionResult, Quote } from "./types";

export interface PriceOverrides {
  /** Customer-supplied gap-filler, honoured only when the snapshot has no price. */
  itemPriceUsd?: number;
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
  const { product, country } = extraction;

  const price = overrides?.itemPriceUsd ?? product.price;
  const currency = overrides?.itemPriceUsd != null ? "USD" : product.currency ?? "USD";

  if (price == null || price <= 0) return { pricing: null, reason: "Price could not be read from the product page." };
  if (!country) return { pricing: null, reason: "This store region is not supported yet." };

  try {
    const pricing = await calculator.calculate({
      itemPrice: price,
      itemCurrency: currency,
      quantity,
      category: product.category ?? null,
      weightLbs: product.weight_lbs ?? undefined,
      productTitle: product.title ?? undefined,
      region: REGION_TO_PRICING[country],
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

/** A live-rate quote with no lock. The customer-facing routes use `quoteForViewer` instead. */
export async function buildQuote(
  extraction: ExtractionResult & { extraction_cache_id: string | null },
  quantity = 1,
): Promise<Quote> {
  const { pricing, reason } = await priceExtraction(extraction, quantity, null, null);
  return { ...extraction, pricing, pricing_unavailable_reason: reason };
}
