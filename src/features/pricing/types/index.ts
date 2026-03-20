// ── Database row types ────────────────────────────────────────────────────────

export interface DbPricingConfig {
  id: string;
  region: "USA" | "UK" | "CHINA";
  base_shipping_fee_usd: number;
  exchange_rate: number;
  service_fee_percentage: number;
  last_updated: string;
  updated_by: string | null;
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

// ── Request types ────────────────────────────────────────────────────────────

export interface UpdatePricingConfigRequest {
  region: "USA" | "UK" | "CHINA";
  baseShippingFeeUsd: number;
  exchangeRate: number;
  serviceFeePercentage: number;
}

// ── Response types — match DbPricingConfig shape ──────────────────────────────

export interface PricingConfigResponse {
  id: string;
  region: string;
  base_shipping_fee_usd: number;
  exchange_rate: number;
  service_fee_percentage: number;
  last_updated: string;
  updated_by: string | null;
}

export interface PricingConfigListResponse {
  configs: PricingConfigResponse[];
}
