/**
 * Database row types — mirror the canonical SQL schema in agent.md.
 */

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
  status: "pending" | "paid" | "processing" | "completed" | "cancelled";
  product_url: string;
  product_name: string;
  product_image_url: string | null;
  estimated_price_usd: number;
  quantity: number;
  origin_country: "USA" | "UK" | "CHINA";
  special_instructions: string | null;
  pricing: OrderPricingBreakdown;
  created_at: string;
  updated_at: string;
}

/** Shape of the JSONB pricing column stored on each order */
export interface OrderPricingBreakdown {
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  shipping_fee_usd: number;
  service_fee_usd: number;
  total_usd: number;
  exchange_rate: number;
  total_ghs: number;
  total_pesewas: number;
  region: "USA" | "UK" | "CHINA";
  service_fee_percentage: number;
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
