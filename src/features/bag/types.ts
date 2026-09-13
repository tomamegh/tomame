import type { PricingBreakdown } from "@/lib/pricing";
import type { OriginCountry } from "@/features/orders/types";

/** One line of the bag, re-priced on every read from the server-owned snapshot. */
export interface BagLine {
  id: string;
  extraction_cache_id: string;
  quantity: number;
  special_instructions: string | null;
  product: {
    title: string | null;
    image: string | null;
    url: string;
    /** Store slug from the extraction (`ExtractionResult.platform`). */
    store: string | null;
    /** Colour/size text from the listing, or null. Never invented. */
    variant: string | null;
    weight_lbs: number | null;
    country: OriginCountry | null;
  };
  /** Null when the line cannot be priced right now; `pricing_unavailable_reason` says why. */
  pricing: PricingBreakdown | null;
  pricing_unavailable_reason: string | null;
  /** The quote screen's gap-fillers, echoed so the bag can show what the customer supplied. */
  gap_price_usd: number | null;
  gap_origin_country: OriginCountry | null;
}

export interface BagView {
  cart_id: string | null;
  lines: BagLine[];
  /** `sum(quantity)` — the nav badge. */
  item_count: number;
  /** Money roll-ups over the priced lines. Delivery and the box saving arrive in F2/F3. */
  subtotal_usd: number;
  tax_usd: number;
  fee_usd: number;
  freight_ghs: number;
  total_ghs: number;
  total_usd: number;
  /** Earliest lock expiry across the lines, ISO; null when nothing is locked. */
  rate_locked_until: string | null;
  /** True when at least one line has no pricing. */
  has_unpriced_lines: boolean;
}

export interface AddToBagResult {
  line: BagLine;
  item_count: number;
  /** False when the product was already in the bag and its quantity was raised. */
  created: boolean;
}
