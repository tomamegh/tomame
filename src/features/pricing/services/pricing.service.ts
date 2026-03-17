import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/features/auth/types";
import type {
  PricingConfigResponse,
  PricingConfigListResponse,
} from "@/features/pricing/types";
import type {
  DbPricingConfig,
  DbFixedFreightItem,
  OrderPricingBreakdown,
} from "@/types/db";
import { getGhsRate } from "@/lib/exchange-rates/service";
import {
  SERVICE_FEE_TIERS,
  FALLBACK_FX_RATE,
  DEFAULT_FX_BUFFER_PCT,
  DEFAULT_FREIGHT_RATE_PER_LB,
  DEFAULT_HANDLING_FEE_USD,
  DEFAULT_VOLUMETRIC_DIVISOR,
} from "@/config/pricing";
import {
  parseWeight,
  parseDimensions,
  getCategoryDefaultWeight,
} from "./weight-parser";
import { lookupProductWeight } from "@/lib/serpapi/weight-lookup";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getPricingConfigByRegion(
  client: SupabaseClient,
  region: "USA" | "UK" | "CHINA"
): Promise<DbPricingConfig | null> {
  const { data, error } = await client
    .from("pricing_config")
    .select("*")
    .eq("region", region)
    .single();

  if (error) {
    logger.error("getPricingConfigByRegion failed", {
      region,
      error: error.message,
    });
    return null;
  }
  return data as DbPricingConfig;
}

async function getAllPricingConfigs(
  client: SupabaseClient
): Promise<DbPricingConfig[]> {
  const { data, error } = await client
    .from("pricing_config")
    .select("*")
    .order("region");

  if (error) {
    logger.error("getAllPricingConfigs failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbPricingConfig[];
}

async function updatePricingConfig(
  client: SupabaseClient,
  region: "USA" | "UK" | "CHINA",
  updates: {
    base_shipping_fee_usd: number;
    exchange_rate: number;
    service_fee_percentage: number;
    updated_by: string;
  }
): Promise<DbPricingConfig | null> {
  const { data, error } = await client
    .from("pricing_config")
    .update({
      ...updates,
      last_updated: new Date().toISOString(),
    })
    .eq("region", region)
    .select()
    .single();

  if (error) {
    logger.error("updatePricingConfig failed", {
      region,
      error: error.message,
    });
    return null;
  }
  return data as DbPricingConfig;
}

/**
 * Find a fixed freight item by matching product name against keywords.
 * Keywords are stored lowercase; we do case-insensitive substring matching.
 * More specific matches (longer keywords) are preferred.
 */
async function findFixedFreightItem(
  productName: string,
): Promise<DbFixedFreightItem | null> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("fixed_freight_items")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    logger.error("findFixedFreightItem query failed", { error: error.message });
    return null;
  }

  if (!data || data.length === 0) return null;

  const nameLower = productName.toLowerCase();
  let bestMatch: DbFixedFreightItem | null = null;
  let bestKeywordLength = 0;

  for (const item of data as DbFixedFreightItem[]) {
    for (const keyword of item.keywords) {
      if (nameLower.includes(keyword) && keyword.length > bestKeywordLength) {
        bestMatch = item;
        bestKeywordLength = keyword.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Get the applied FX rate: mid-market rate × (1 + buffer).
 * Falls back to FALLBACK_FX_RATE if DB has no data.
 */
async function getAppliedFxRate(
  baseCurrency: string,
): Promise<{ appliedRate: number; midMarketRate: number }> {
  const midMarketRate = await getGhsRate(baseCurrency);
  const rate = midMarketRate ?? FALLBACK_FX_RATE;
  return {
    midMarketRate: rate,
    appliedRate: roundTo2(rate * (1 + DEFAULT_FX_BUFFER_PCT)),
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate the tiered service fee for Method 2.
 */
function calculateServiceFee(itemPriceUsd: number): {
  feeUsd: number;
  percentage: number;
} {
  for (const tier of SERVICE_FEE_TIERS) {
    if (itemPriceUsd <= tier.maxUsd) {
      const calculated = roundTo2(itemPriceUsd * tier.percentage);
      const feeUsd = Math.max(calculated, tier.minimumUsd);
      return { feeUsd, percentage: tier.percentage };
    }
  }
  // Shouldn't reach here since last tier is Infinity — fallback to 8%
  return {
    feeUsd: roundTo2(itemPriceUsd * 0.08),
    percentage: 0.08,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function getAll(
  client: SupabaseClient,
): Promise<PricingConfigListResponse> {
  const configs = await getAllPricingConfigs(client);
  return { configs: configs as PricingConfigResponse[] };
}

export async function updateRegionPricing(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  region: "USA" | "UK" | "CHINA",
  baseShippingFeeUsd: number,
  exchangeRate: number,
  serviceFeePercentage: number,
): Promise<PricingConfigResponse> {
  const current = await getPricingConfigByRegion(client, region);
  if (!current) {
    throw new APIError(404, "Pricing config not found for region");
  }

  const updated = await updatePricingConfig(client, region, {
    base_shipping_fee_usd: baseShippingFeeUsd,
    exchange_rate: exchangeRate,
    service_fee_percentage: serviceFeePercentage,
    updated_by: admin.id,
  });

  if (!updated) {
    throw new APIError(500, "Failed to update pricing config");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "pricing_config_updated",
    entityType: "order",
    entityId: updated.id,
    metadata: {
      region,
      previous: {
        baseShippingFeeUsd: current.base_shipping_fee_usd,
        exchangeRate: current.exchange_rate,
        serviceFeePercentage: current.service_fee_percentage,
      },
      updated: { baseShippingFeeUsd, exchangeRate, serviceFeePercentage },
    },
  });

  return updated as PricingConfigResponse;
}

// ── Input type for calculatePricing ──────────────────────────────────────────

export interface CalculatePricingInput {
  itemPriceUsd: number;
  quantity: number;
  region: "USA" | "UK" | "CHINA";
  productName?: string;
  category?: string | null;
  sellerShippingUsd?: number;
  weightLbs?: number;
  weightSource?: "scraped" | "category_default";
  dimensionsInches?: { length: number; width: number; height: number } | null;
}

/**
 * Calculate the full pricing breakdown for an order.
 *
 * Two methods:
 *   Method 1 (Fixed Freight) — for recognized products in the fixed_freight_items table
 *   Method 2 (Formula-Based) — weight-based freight, tiered service fee, handling
 *
 * FX rate: mid-market from exchange_rates table × (1 + 4% buffer).
 */
export async function calculatePricing(
  input: CalculatePricingInput,
): Promise<OrderPricingBreakdown> {
  const {
    itemPriceUsd,
    quantity,
    region,
    productName,
    category,
    sellerShippingUsd = 0,
    dimensionsInches,
  } = input;

  // Resolve FX rate based on region
  const currencyMap: Record<string, string> = {
    USA: "USD",
    UK: "GBP",
    CHINA: "CNY",
  };
  const baseCurrency = currencyMap[region] ?? "USD";
  const { appliedRate, midMarketRate } = await getAppliedFxRate(baseCurrency);

  const subtotalUsd = roundTo2(itemPriceUsd * quantity);

  // Try fixed freight matching if product name is provided
  const fixedFreightItem = productName
    ? await findFixedFreightItem(productName)
    : null;

  if (fixedFreightItem) {
    // ── Method 1: Fixed Freight ──────────────────────────────────────────
    const itemPriceGhs = roundTo2(subtotalUsd * appliedRate);
    const totalGhs = roundTo2(itemPriceGhs + fixedFreightItem.freight_rate_ghs);
    const totalPesewas = Math.round(totalGhs * 100);

    return {
      pricing_method: "fixed_freight",
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: appliedRate,
      mid_market_rate: midMarketRate,
      total_ghs: totalGhs,
      total_pesewas: totalPesewas,
      region,
      fixed_freight_ghs: fixedFreightItem.freight_rate_ghs,
      fixed_freight_item_id: fixedFreightItem.id,
    };
  }

  // ── Method 2: Formula-Based ──────────────────────────────────────────
  // Resolve weight — 3-step fallback:
  //   Step 1: Scraped weight from product URL (passed in as input.weightLbs)
  //   Step 2: Search internet via SerpAPI for "[product name] weight specs"
  //   Step 3: Apply category default weight
  let weightLbs = input.weightLbs ?? null;
  let weightSource: "scraped" | "internet_search" | "category_default" =
    input.weightSource ?? "scraped";

  // Step 2: SerpAPI internet search if no scraped weight
  if (weightLbs == null && productName) {
    const serpResult = await lookupProductWeight(productName);
    if (serpResult) {
      weightLbs = serpResult.weightLbs;
      weightSource = "internet_search";
    }
  }

  // Step 3: Category default weight
  if (weightLbs == null && category) {
    weightLbs = getCategoryDefaultWeight(category);
    if (weightLbs != null) {
      weightSource = "category_default";
    }
  }

  // Final fallback to general accessories weight
  if (weightLbs == null) {
    weightLbs = 0.5;
    weightSource = "category_default";
  }

  // Calculate volumetric weight if dimensions available
  let volumetricWeightLbs: number | null = null;
  const dims = dimensionsInches ?? null;
  if (dims) {
    volumetricWeightLbs = roundTo2(
      (dims.length * dims.width * dims.height) / DEFAULT_VOLUMETRIC_DIVISOR,
    );
  }

  // Chargeable weight = max(actual, volumetric)
  const chargeableWeight = roundTo2(
    Math.max(weightLbs, volumetricWeightLbs ?? 0),
  );

  // Freight
  const freightUsd = roundTo2(chargeableWeight * DEFAULT_FREIGHT_RATE_PER_LB);

  // Tiered service fee
  const { feeUsd: serviceFeeUsd, percentage: serviceFeePercentage } =
    calculateServiceFee(itemPriceUsd);

  // Handling
  const handlingFeeUsd = DEFAULT_HANDLING_FEE_USD;

  // Total USD (all components summed before FX)
  const sellerShipping = roundTo2(sellerShippingUsd);
  const totalUsd = roundTo2(
    subtotalUsd +
      sellerShipping +
      freightUsd +
      serviceFeeUsd +
      handlingFeeUsd,
  );

  // Convert to GHS
  const totalGhs = roundTo2(totalUsd * appliedRate);
  const totalPesewas = Math.round(totalGhs * 100);

  return {
    pricing_method: "formula",
    item_price_usd: itemPriceUsd,
    quantity,
    subtotal_usd: subtotalUsd,
    exchange_rate: appliedRate,
    mid_market_rate: midMarketRate,
    total_ghs: totalGhs,
    total_pesewas: totalPesewas,
    region,
    seller_shipping_usd: sellerShipping,
    freight_usd: freightUsd,
    service_fee_usd: serviceFeeUsd,
    service_fee_percentage: serviceFeePercentage,
    handling_fee_usd: handlingFeeUsd,
    total_usd: totalUsd,
    weight_lbs: weightLbs,
    weight_source: weightSource,
    dimensions_inches: dims,
    volumetric_weight_lbs: volumetricWeightLbs ?? undefined,
    chargeable_weight_lbs: chargeableWeight,
  };
}
