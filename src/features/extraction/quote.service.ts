import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { logger } from "@/lib/logger";
import { REGION_TO_PRICING } from "@/features/extraction/url";
import type { PricingBreakdown } from "@/lib/pricing";
import type { ExtractionResult, Quote } from "./types";


/**
 * Price a stored extraction. This is THE pricing entry point for anything
 * derived from a scrape — the quote endpoint, the review page preview, and
 * order creation all call it with the same server-owned snapshot, so the
 * number the customer saw and the number they are charged come from one
 * function over one input.
 */
export async function priceExtraction(
  extraction: ExtractionResult,
  quantity: number,
  overrides?: { itemPriceUsd?: number },
): Promise<{ pricing: PricingBreakdown | null; reason: string | null }> {
  const { product, country } = extraction;

  const price = overrides?.itemPriceUsd ?? product.price;
  const currency = overrides?.itemPriceUsd != null ? "USD" : product.currency ?? "USD";

  if (price == null || price <= 0) return { pricing: null, reason: "Price could not be read from the product page." };
  if (!country) return { pricing: null, reason: "This store region is not supported yet." };

  try {
    const pricing = await calculatePricing({
      itemPrice: price,
      itemCurrency: currency,
      quantity,
      category: product.category ?? null,
      weightLbs: product.weight_lbs ?? undefined,
      productTitle: product.title ?? undefined,
      region: REGION_TO_PRICING[country],
    });
    return { pricing, reason: null };
  } catch (err) {
    logger.warn("quote: pricing failed", { error: err instanceof Error ? err.message : String(err) });
    return { pricing: null, reason: err instanceof Error ? err.message : "Pricing is temporarily unavailable." };
  }
}

export async function buildQuote(
  extraction: ExtractionResult & { extraction_cache_id: string | null },
  quantity = 1,
): Promise<Quote> {
  const { pricing, reason } = await priceExtraction(extraction, quantity);
  return { ...extraction, pricing, pricing_unavailable_reason: reason };
}
