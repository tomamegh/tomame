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
  // Common fields
  pricing_method: "fixed_freight" | "formula";
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  exchange_rate: number;
  mid_market_rate: number;
  total_ghs: number;
  total_pesewas: number;
  region: "USA" | "UK" | "CHINA";

  // Fixed freight fields (Method 1)
  fixed_freight_ghs?: number;
  fixed_freight_item_id?: string;

  // Formula fields (Method 2)
  seller_shipping_usd?: number;
  freight_usd?: number;
  service_fee_usd?: number;
  service_fee_percentage?: number;
  handling_fee_usd?: number;
  total_usd?: number;
  weight_lbs?: number;
  weight_source?: "scraped" | "internet_search" | "category_default";
  dimensions_inches?: { length: number; width: number; height: number } | null;
  volumetric_weight_lbs?: number;
  chargeable_weight_lbs?: number;
}

export interface DbFixedFreightItem {
  id: string;
  category: string;
  product_name: string;
  freight_rate_ghs: number;
  keywords: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbPricingConstant {
  id: string;
  key: string;
  value: number;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
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

export interface DbOrderDelivery {
  id: string;
  order_id: string;
  user_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: "pending" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned";
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
