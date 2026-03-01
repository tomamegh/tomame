// ── Request types ────────────────────────────────────────────────────────────

export interface UpdatePricingConfigRequest {
  region: "USA" | "UK" | "CHINA";
  baseShippingFeeUsd: number;
  exchangeRate: number;
  serviceFeePercentage: number;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface PricingConfigResponse {
  id: string;
  region: string;
  baseShippingFeeUsd: number;
  exchangeRate: number;
  serviceFeePercentage: number;
  lastUpdated: string;
}

export interface PricingConfigListResponse {
  configs: PricingConfigResponse[];
}
