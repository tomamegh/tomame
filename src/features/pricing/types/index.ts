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
