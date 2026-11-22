import type { ScrapedProduct } from "../scrapers/types";
import type { ExtractionSource } from "@/config/extraction";
import type { PricingBreakdown } from "@/lib/pricing";
import type { FreightInspection } from "@/features/pricing/freight-inspection";
import type { HtmlPriceRejection, PriceConfidence, PriceRead, PriceVerdict } from "../price-confidence";
import type { PriceHistoryEntry } from "../price-context";
import type { PayHold } from "../pay-gate";

export type { ScrapedProduct };
export { withProductDefaults, emptyProduct } from "../scrapers/types";

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
  /**
   * Per-field confidence 0..1 of the winning value. Keyed by every
   * `ScrapedProduct` field, including the typed facts (`seller`, `condition`,
   * `rating`, `review_count`, `availability`); `images` / `variants` are unions
   * and carry no single confidence.
   */
  confidence: Partial<Record<keyof ScrapedProduct, number>>;
  fetched_at: string;
  /**
   * The freight inspector's verdict on this product's freight decision, made
   * once at extraction time. Applied by `priceExtractionWith` only while its
   * `input_key` still matches the product; absent on rows cached before it.
   * Never shown to customers.
   */
  freight_inspection?: FreightInspection;
  /** Every tier's price reading (A0). Absent on rows cached before 2026-11-20. */
  price_reads?: PriceRead[];
  /** Earlier reads at a different price, oldest first (price-context.ts). Absent before 2026-11-22. */
  price_history?: PriceHistoryEntry[];
  /** Tier the quoted price came from; `"staff"` once a buyer corrected it. */
  price_source?: ExtractionSource | "staff" | null;
  /** How far the quoted price can be trusted, judged at extraction (price-confidence.ts). */
  price_confidence?: PriceVerdict | null;
  /** What the chain refused, for daily health (A2, A3). */
  quality?: ExtractionQuality;
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
  /**
   * Non-null while the freight weight is being checked in the background. The
   * price shown meanwhile may still move, so nothing can be added to the bag
   * or paid until it clears; the quote screen polls until it does.
   */
  freight_check: FreightCheck | null;
  /** How far the price can be trusted; null when there is no price. */
  price_status: PriceConfidence | null;
  /** Non-null when stock or condition must be confirmed before payment (A7). */
  stock_check: StockCheckView | null;
  /** Why this line cannot be paid for yet, or null when it can (pay-gate.ts). */
  pay_hold: PayHold | null;
}

export interface ExtractionQuality {
  leaked: Array<{ field: string; source: ExtractionSource }>;
  price_rejected: { price: number; currency: string | null; source: ExtractionSource; reason: HtmlPriceRejection } | null;
}

/** The customer's view of a stock check. */
export interface StockCheckView {
  /** What triggered it, in customer words ("Renewed item", "Only 2 left"). */
  reasons: string[];
  status: "needed" | "requested" | "confirmed" | "unavailable";
  /** Until when a confirmation holds. */
  valid_until: string | null;
  substitute_url: string | null;
  /** `wa.me` link with the item and quote reference filled in; null when no number is set. */
  whatsapp_url: string | null;
  /** Short reference the customer and staff both see. */
  reference: string;
}

export interface FreightCheck {
  status: "checking";
  /** When the check started, ISO; the screen says "taking longer" from this. */
  started_at: string;
}

export interface CachedExtraction {
  id: string;
  result: ExtractionResult;
}
