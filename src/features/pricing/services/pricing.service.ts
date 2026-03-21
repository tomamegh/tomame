import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import type {
  PricingConfigResponse,
  PricingConfigListResponse,
} from "@/features/pricing/types";
import type {
  PricingConfig,
  FixedFreightItem,
} from "@/features/pricing/types";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { getGhsRate } from "@/lib/exchange-rates/service";
import {
  TAX_TIERS,
  FALLBACK_FX_RATE,
  DEFAULT_FX_BUFFER_PCT,
  DEFAULT_FREIGHT_RATE_PER_LB,
  DEFAULT_HANDLING_FEE_USD,
  DEFAULT_VOLUMETRIC_DIVISOR,
  DEFAULT_MINIMUM_TAX_USD,
} from "@/config/pricing";
import {
  getCategoryDefaultWeight,
} from "./weight-parser";
import { lookupProductWeight } from "@/lib/serpapi/weight-lookup";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getPricingConfigByRegion(
  client: SupabaseClient,
  region: "USA" | "UK" | "CHINA"
): Promise<PricingConfig | null> {
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
  return data as PricingConfig;
}

async function getAllPricingConfigs(
  client: SupabaseClient
): Promise<PricingConfig[]> {
  const { data, error } = await client
    .from("pricing_config")
    .select("*")
    .order("region");

  if (error) {
    logger.error("getAllPricingConfigs failed", { error: error.message });
    return [];
  }
  return (data ?? []) as PricingConfig[];
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
): Promise<PricingConfig | null> {
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
  return data as PricingConfig;
}

/**
 * Find a fixed freight item by matching product name against keywords.
 * Keywords are stored lowercase; we do case-insensitive substring matching.
 * More specific matches (longer keywords) are preferred.
 */
async function findFixedFreightItem(
  productName: string,
): Promise<FixedFreightItem | null> {
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
  let bestMatch: FixedFreightItem | null = null;
  let bestKeywordLength = 0;

  for (const item of data as FixedFreightItem[]) {
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
 * Load admin-editable pricing constants from the DB.
 * Falls back to hardcoded defaults if the DB query fails.
 */
async function getPricingConstants(): Promise<{
  freightRatePerLb: number;
  handlingFeeUsd: number;
  fxBufferPct: number;
  volumetricDivisor: number;
  minimumTaxUsd: number;
}> {
  const defaults = {
    freightRatePerLb: DEFAULT_FREIGHT_RATE_PER_LB,
    handlingFeeUsd: DEFAULT_HANDLING_FEE_USD,
    fxBufferPct: DEFAULT_FX_BUFFER_PCT,
    volumetricDivisor: DEFAULT_VOLUMETRIC_DIVISOR,
    minimumTaxUsd: DEFAULT_MINIMUM_TAX_USD,
  };

  try {
    const client = createAdminClient();
    const { data, error } = await client
      .from("pricing_constants")
      .select("key, value");

    if (error || !data?.length) {
      logger.warn("Failed to load pricing_constants, using defaults", { error: error?.message });
      return defaults;
    }

    const map = Object.fromEntries(data.map((r) => [r.key, Number(r.value)]));
    return {
      freightRatePerLb: map.freight_rate_per_lb ?? defaults.freightRatePerLb,
      handlingFeeUsd: map.handling_fee_usd ?? defaults.handlingFeeUsd,
      fxBufferPct: map.fx_buffer_pct ?? defaults.fxBufferPct,
      volumetricDivisor: map.volumetric_divisor ?? defaults.volumetricDivisor,
      minimumTaxUsd: map.minimum_tax_usd ?? defaults.minimumTaxUsd,
    };
  } catch {
    logger.warn("Exception loading pricing_constants, using defaults");
    return defaults;
  }
}

/**
 * Get the applied FX rate: mid-market rate × (1 + buffer).
 * Falls back to FALLBACK_FX_RATE if DB has no data.
 */
async function getAppliedFxRate(
  baseCurrency: string,
  fxBufferPct: number,
): Promise<{ appliedRate: number; midMarketRate: number }> {
  const midMarketRate = await getGhsRate(baseCurrency);
  const rate = midMarketRate ?? FALLBACK_FX_RATE;
  return {
    midMarketRate: rate,
    appliedRate: roundTo2(rate * (1 + fxBufferPct)),
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate tax for Method 2.
 *
 * If the region has a tax % set in pricing_config, use that flat rate.
 * Otherwise, fall back to the hardcoded tiered schedule in TAX_TIERS.
 * In both cases, the minimum tax from pricing_constants is enforced.
 */
function calculateTax(
  itemPriceUsd: number,
  regionTaxPct: number | null,
  minimumTaxUsd: number,
): {
  feeUsd: number;
  percentage: number;
} {
  // Use region-specific flat rate if set (> 0)
  if (regionTaxPct != null && regionTaxPct > 0) {
    const calculated = roundTo2(itemPriceUsd * regionTaxPct);
    const feeUsd = Math.max(calculated, minimumTaxUsd);
    return { feeUsd, percentage: regionTaxPct };
  }

  // Fallback to hardcoded tiers
  for (const tier of TAX_TIERS) {
    if (itemPriceUsd <= tier.maxUsd) {
      const calculated = roundTo2(itemPriceUsd * tier.percentage);
      const feeUsd = Math.max(calculated, minimumTaxUsd);
      return { feeUsd, percentage: tier.percentage };
    }
  }
  // Shouldn't reach here since last tier is Infinity — fallback to 8%
  return {
    feeUsd: Math.max(roundTo2(itemPriceUsd * 0.08), minimumTaxUsd),
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
  admin: PlatformUser,
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
 *   Method 2 (Formula-Based) — weight-based freight, tiered tax, handling
 *
 * FX rate: mid-market from exchange_rates table × (1 + buffer from pricing_constants).
 * Freight rate, handling fee, FX buffer, and volumetric divisor are read from the
 * pricing_constants table (admin-editable), with hardcoded fallbacks.
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

  // Load admin-editable constants from DB
  const constants = await getPricingConstants();

  // Load region-specific tax % from pricing_config
  const regionConfig = await getPricingConfigByRegion(createAdminClient(), region);
  const regionTaxPct = regionConfig?.service_fee_percentage ?? null;

  // Resolve FX rate based on region
  const currencyMap: Record<string, string> = {
    USA: "USD",
    UK: "GBP",
    CHINA: "CNY",
  };
  const baseCurrency = currencyMap[region] ?? "USD";
  const { appliedRate, midMarketRate } = await getAppliedFxRate(baseCurrency, constants.fxBufferPct);

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
      (dims.length * dims.width * dims.height) / constants.volumetricDivisor,
    );
  }

  // Chargeable weight = max(actual, volumetric)
  const chargeableWeight = roundTo2(
    Math.max(weightLbs, volumetricWeightLbs ?? 0),
  );

  // Freight — uses admin-editable rate from DB
  const freightUsd = roundTo2(chargeableWeight * constants.freightRatePerLb);

  // Tax — uses region's % from pricing_config, with minimum from pricing_constants
  const { feeUsd: taxUsd, percentage: taxPercentage } =
    calculateTax(itemPriceUsd, regionTaxPct, constants.minimumTaxUsd);

  // Handling — uses admin-editable fee from DB
  const handlingFeeUsd = constants.handlingFeeUsd;

  // Total USD (all components summed before FX)
  const sellerShipping = roundTo2(sellerShippingUsd);
  const totalUsd = roundTo2(
    subtotalUsd +
      sellerShipping +
      freightUsd +
      taxUsd +
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
    service_fee_usd: taxUsd,
    service_fee_percentage: taxPercentage,
    handling_fee_usd: handlingFeeUsd,
    total_usd: totalUsd,
    weight_lbs: weightLbs,
    weight_source: weightSource,
    dimensions_inches: dims,
    volumetric_weight_lbs: volumetricWeightLbs ?? undefined,
    chargeable_weight_lbs: chargeableWeight,
  };
}
