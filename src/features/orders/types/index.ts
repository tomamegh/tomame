// ── Pricing breakdown ────────────────────────────────────────────────────────

/** Shape of the JSONB pricing column stored on each order */
export interface OrderPricingBreakdown {
  // Common fields
  pricing_method: "flat_rate" | "weight_based" | "needs_review";
  pricing_group: string | null;
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  exchange_rate: number;
  mid_market_rate: number;
  tax_percentage: number;
  tax_usd: number;
  value_fee_percentage: number;
  value_fee_usd: number;
  total_ghs: number;
  total_pesewas: number;
  region: "USA" | "UK" | "CHINA";

  // Flat rate fields (fixed GHS freight — weight baked in)
  flat_rate_ghs?: number;

  // Weight-based fields
  freight_usd?: number;
  freight_ghs?: number;
  weight_lbs?: number;
  weight_source?: "scraped" | "category_default";
  per_weight_rate_usd?: number;

  // Needs review — pricing incomplete, flagged for admin
  review_reason?: string;
}

// ── Extraction metadata ───────────────────────────────────────────────────────

export interface OrderExtractionMetadata {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: {
    title: string | null;
    image: string | null;
    price: number | null;
    currency: string | null;
    description: string | null;
    brand: string | null;
    category?: string | null;
    size: string | null;
    weight: string | null;
    dimensions: string | null;
    specifications: Record<string, string>;
    metadata: Record<string, unknown>;
  };
  errors: string[];
  fetchedAt: string;
}

// ── Domain types ─────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled";

export type OriginCountry = "USA" | "UK" | "CHINA";

/** Matches the database row shape directly — no camelCase mapping. */
export interface Order {
  id: string;
  user_id: string;
  payment_id: string | null;
  status: OrderStatus;
  product_url: string;
  product_name: string;
  product_image_url: string | null;
  estimated_price_usd: number;
  quantity: number;
  origin_country: OriginCountry;
  special_instructions: string | null;
  pricing: OrderPricingBreakdown;
  tracking_number: string | null;
  carrier: string | null;
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  extraction_data: Record<string, unknown> | null;
  needs_review: boolean;
  review_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  extraction_metadata: OrderExtractionMetadata | null;
  created_at: string;
  updated_at: string;
  // Joined from order_deliveries (present on admin fetch)
  tracking_url?: string | null;
  delivery_notes?: string | null;
}

export interface OrderList {
  orders: Order[];
  count: number;
}
