import type { ScrapedProduct } from "../scrapers/types";
import type { ExtractionSource } from "@/config/extraction";
import type { PricingBreakdown } from "@/lib/pricing";

export type { ScrapedProduct };

export interface ExtractionResult {
  extraction_attempted: boolean;
  /** Title, price and currency were all found. */
  extraction_success: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: ScrapedProduct;
  /** Customer-facing notes about what could not be read. */
  messages: string[];
  /** @deprecated alias of `messages`, kept for older cached rows / UI. */
  errors: string[];
  /** Resolver that supplied the title. */
  source: ExtractionSource | null;
  /** Every resolver that ran, in order. */
  sources: ExtractionSource[];
  /** Per-field confidence 0..1 of the winning value. */
  confidence: Partial<Record<keyof ScrapedProduct, number>>;
  fetched_at: string;
  /** ID of the extraction_cache row — present when returned from the API */
  extraction_cache_id?: string | null;
  /** True when served from cache rather than a fresh extraction. */
  cached?: boolean;
}

/**
 * What /api/products/extract returns: the extraction plus a server-computed
 * price for quantity 1. The pricing is informational for the customer — the
 * server recomputes from the cached snapshot at order creation and at payment.
 */
export interface Quote extends ExtractionResult {
  extraction_cache_id: string | null;
  pricing: PricingBreakdown | null;
  /** Why pricing is null (e.g. price missing, region unsupported). */
  pricing_unavailable_reason: string | null;
}

export interface ProductPreviewProps {
  data: Quote;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}

export interface CachedExtraction {
  id: string;
  result: ExtractionResult;
}
