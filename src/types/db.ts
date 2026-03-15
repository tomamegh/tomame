/**
 * Database row types — mirror the canonical SQL schema in agent.md.
 */
import type { OrderExtractionMetadata } from "@/features/orders/types";

export interface DbUser {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
}

export interface DbAuditLog {
  id: string;
  actor_id: string | null;
  actor_role: "user" | "admin" | "system";
  action: string;
  entity_type: "user" | "payment" | "order" | "job";
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbPayment {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DbOrder {
  id: string;
  user_id: string;
  payment_id: string | null;
  status: "pending" | "paid" | "processing" | "in_transit" | "delivered" | "completed" | "cancelled";
  tracking_number: string | null;
  carrier: string | null;
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  product_url: string;
  product_name: string;
  product_image_url: string | null;
  estimated_price_usd: number;
  quantity: number;
  origin_country: "USA" | "UK" | "CHINA";
  special_instructions: string | null;
  pricing: OrderPricingBreakdown;
  needs_review: boolean;
  review_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  extraction_metadata: OrderExtractionMetadata | null;
  extraction_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Shape of the JSONB pricing column stored on each order */
export interface OrderPricingBreakdown {
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  /** Seller shipping to Tomame's US warehouse (default $0 if not detected) */
  seller_shipping_usd: number;
  /** International freight based on chargeable weight × $6.50/lb */
  freight_usd: number;
  service_fee_usd: number;
  /** Flat $15 handling fee per order (warehouse handling, repackaging, docs) */
  handling_fee_usd: number;
  total_usd: number;
  /** Mid-market USD/GHS rate (before buffer) */
  mid_market_rate: number;
  /** Applied FX rate = mid_market_rate × 1.04 (4% currency buffer) */
  exchange_rate: number;
  total_ghs: number;
  total_pesewas: number;
  region: "USA" | "UK" | "CHINA";
  service_fee_percentage: number;
  /** Weight info for freight calculation */
  weight?: {
    actual_lbs: number | null;
    volumetric_lbs: number | null;
    chargeable_lbs: number;
    /** How weight was determined: "scraped" | "internet_search" | "category_default" */
    source: "scraped" | "internet_search" | "category_default";
  };
  /** When true, uses Method 1 (fixed freight from static price list) */
  is_static_price: boolean;
  /** ID of the matched static_price_list row, if any */
  static_price_id: string | null;

  // ── Deprecated (kept for backward compat with existing orders) ──
  /** @deprecated Use seller_shipping_usd + freight_usd instead */
  shipping_fee_usd?: number;
}

export interface DbNotification {
  id: string;
  user_id: string;
  channel: "email" | "whatsapp";
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  created_at: string;
  sent_at: string | null;
}

export interface DbJob {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbPricingConfig {
  id: string;
  region: "USA" | "UK" | "CHINA";
  base_shipping_fee_usd: number;
  exchange_rate: number;
  service_fee_percentage: number;
  last_updated: string;
  updated_by: string | null;
}

export interface DbStaticPriceItem {
  id: string;
  category: string;
  product_name: string;
  price_ghs: number;
  price_min_ghs: number | null;
  price_max_ghs: number | null;
  is_active: boolean;
  sort_order: number;
  keywords: string[];
  skus: string[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DbExchangeRate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  provider: string;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}
