import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { priceExtraction } from "@/features/extraction/quote.service";
import { resolvePlatform } from "@/features/extraction/scrapers";
import { regionForUrl } from "@/features/extraction/url";
import { hasRequiredFields } from "@/features/extraction/resolvers/merge";
import type { ExtractionResult } from "@/features/extraction/types";
import type { PricingBreakdown } from "@/lib/pricing";
import type { CreateOrderSchemaType } from "../schema";
import type { OriginCountry } from "../types";

export interface OrderIntake {
  product_name: string;
  product_image_url: string | null;
  /** USD-normalised price used for pricing. */
  estimated_price_usd: number;
  origin_country: OriginCountry;
  pricing: PricingBreakdown;
  needs_review: boolean;
  review_reasons: string[];
  extraction_metadata: ExtractionResult | null;
  extraction_cache_id: string | null;
}

/**
 * The trust boundary between a customer's form and an order row.
 *
 * Takes the client's request and the server-owned extraction snapshot, and
 * decides every money-relevant field itself. The client can name the product,
 * pick a quantity and leave instructions. It can supply a price or region only
 * to fill a gap the extraction left, and doing so flags the order for review.
 */
export async function buildOrderIntake(input: CreateOrderSchemaType): Promise<OrderIntake> {
  const platform = resolvePlatform(input.product_url);
  if (!platform) throw new APIError(400, "We currently do not support this store. Please try again");

  const snapshot = input.extraction_cache_id ? await getExtractionSnapshot(input.extraction_cache_id) : null;
  if (input.extraction_cache_id && !snapshot) {
    logger.warn("order intake: extraction snapshot not found", { id: input.extraction_cache_id });
  }
  const extraction = snapshot?.result ?? null;
  const product = extraction?.product ?? null;

  const reasons: string[] = [];

  // ── Price ────────────────────────────────────────────────────────────────
  let priceOverrideUsd: number | undefined;
  if (product?.price != null && product.price > 0) {
    // Server snapshot wins. The client's estimate is ignored.
  } else if (input.estimated_price_usd != null) {
    priceOverrideUsd = input.estimated_price_usd;
    reasons.push("Price entered by customer — not verified against the store.");
  } else {
    throw new APIError(400, "We couldn't read a price for this product. Please enter the item price.");
  }

  // ── Region ───────────────────────────────────────────────────────────────
  let country: OriginCountry | null = extraction?.country ?? regionForUrl(input.product_url);
  if (!country) {
    if (!input.origin_country) throw new APIError(400, "Please select the country this item ships from.");
    country = input.origin_country;
    reasons.push("Origin country selected by customer — store region not recognised.");
  }

  // ── Extraction quality ───────────────────────────────────────────────────
  if (!extraction || !product) {
    reasons.push("Order placed without automatic product extraction.");
  } else if (!hasRequiredFields(product)) {
    reasons.push("Automatic extraction was incomplete.");
  }
  if (product && product.title && input.product_name.trim() !== product.title.trim()) {
    reasons.push("Customer edited the product name.");
  }

  // ── Pricing (server-side, from the snapshot) ─────────────────────────────
  const pricingBase: ExtractionResult =
    extraction ?? {
      extraction_attempted: false,
      extraction_success: false,
      platform,
      country,
      product: {
        title: input.product_name,
        image: input.product_image_url ?? null,
        price: null,
        currency: null,
        description: null,
        brand: null,
        category: null,
        size: null,
        weight: null,
        weight_lbs: null,
        dimensions: null,
        specifications: {},
        metadata: {},
      },
      messages: [],
      errors: [],
      source: null,
      sources: [],
      confidence: {},
      fetched_at: new Date().toISOString(),
    };

  const { pricing, reason } = await priceExtraction(
    { ...pricingBase, country },
    input.quantity,
    priceOverrideUsd != null ? { itemPriceUsd: priceOverrideUsd } : undefined,
  );
  if (!pricing) {
    throw new APIError(503, reason ?? "Pricing is temporarily unavailable. Please try again shortly.");
  }
  if (pricing.pricing_method === "needs_review") {
    reasons.push(pricing.review_reason ?? "Pricing could not be determined");
  }

  return {
    product_name: input.product_name,
    product_image_url: input.product_image_url ?? product?.image ?? null,
    estimated_price_usd: pricing.item_price_usd,
    origin_country: country,
    pricing,
    needs_review: reasons.length > 0,
    review_reasons: reasons,
    extraction_metadata: extraction,
    extraction_cache_id: snapshot?.id ?? null,
  };
}
