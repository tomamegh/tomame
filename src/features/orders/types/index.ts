// ── Pricing breakdown ────────────────────────────────────────────────────────

import type { PricingBreakdown } from "@/lib/pricing";
import type { ExtractionResult } from "@/features/extraction/types";

/** Re-export from lib/pricing — this is the JSONB pricing column on each order */
export type OrderPricingBreakdown = PricingBreakdown;

// ── Extraction metadata ───────────────────────────────────────────────────────

/** The server-side extraction snapshot stored on the order (same shape as the cache row). */
export type OrderExtractionMetadata = ExtractionResult;

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
  /**
   * 050: the human order number, "TM-00042". Server-assigned from a sequence
   * default — NOT NULL in the database and never accepted from a client.
   */
  order_no: string;
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
  /** The midpoint of the window below; still read by the deliveries table and the status email. */
  estimated_delivery_date: string | null;
  /** 050: the delivery WINDOW the customer is shown. Null until an operator sets one. */
  eta_from?: string | null;
  eta_to?: string | null;
  delivered_at: string | null;
  extraction_data: Record<string, unknown> | null;
  needs_review: boolean;
  review_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  extraction_metadata: OrderExtractionMetadata | null;
  extraction_cache_id: string | null;
  /** 048: set when the order was bought as part of a bag (one payment for the group). */
  order_group_id?: string | null;
  consolidation_box_id?: string | null;
  delivery_address_id?: string | null;
  admin_total_ghs: number | null;
  admin_pricing_note: string | null;
  pricing_set_by: string | null;
  pricing_set_at: string | null;
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

// ── Review types ─────────────────────────────────────────────────────────────

export interface OrderReviewUpdates {
  needs_review?: boolean;
  review_reasons?: string[];
  reviewed_by?: string;
  reviewed_at?: string;
  product_name?: string;
  product_image_url?: string | null;
  estimated_price_usd?: number;
  origin_country?: string;
  status?: string;
  pricing?: Record<string, unknown>;
}

export interface OrderReviewInput {
  action: "approve" | "reject" | "set_price";
  updates?: {
    product_name?: string;
    estimated_price_usd?: number;
    product_image_url?: string | null;
    origin_country?: OriginCountry;
  };
  reason?: string;
    admin_total_ghs?: number;
    admin_pricing_note?: string;
}
