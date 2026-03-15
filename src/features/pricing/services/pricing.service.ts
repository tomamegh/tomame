import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  PricingConfigResponse,
  PricingConfigListResponse,
} from "@/features/pricing/types";
import type { DbPricingConfig, OrderPricingBreakdown } from "@/types/db";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a DB row to the API response shape */
function toResponse(config: {
  id: string;
  region: string;
  base_shipping_fee_usd: number;
  exchange_rate: number;
  service_fee_percentage: number;
  last_updated: string;
}): PricingConfigResponse {
  return {
    id: config.id,
    region: config.region,
    baseShippingFeeUsd: config.base_shipping_fee_usd,
    exchangeRate: config.exchange_rate,
    serviceFeePercentage: config.service_fee_percentage,
    lastUpdated: config.last_updated,
  };
}

/** Round to 2 decimal places (avoids floating-point drift) */
function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Pricing constants (from Pricing Model PDF) ──────────────────────────────

/** FX buffer: 4% on top of mid-market rate to protect against daily movements */
const FX_BUFFER = 0.04;

/** Freight rate per pound */
const FREIGHT_RATE_PER_LB = 6.50;

/** Volumetric weight divisor (inches) */
const VOLUMETRIC_DIVISOR = 139;

/** Flat handling fee per order (warehouse handling, repackaging, documentation) */
const HANDLING_FEE_USD = 15.00;

// ── Tiered service fee ──────────────────────────────────────────────────────

interface ServiceFeeTier {
  /** Upper bound (inclusive). Use Infinity for the last tier. */
  maxUsd: number;
  /** Fee as a decimal (e.g. 0.18 = 18%) */
  rate: number;
  /** Minimum fee in USD (only applies to the lowest tier) */
  minFeeUsd: number;
}

const SERVICE_FEE_TIERS: ServiceFeeTier[] = [
  { maxUsd: 99.99,   rate: 0.18, minFeeUsd: 12 },
  { maxUsd: 300,     rate: 0.15, minFeeUsd: 0 },
  { maxUsd: 700,     rate: 0.12, minFeeUsd: 0 },
  { maxUsd: 1500,    rate: 0.10, minFeeUsd: 0 },
  { maxUsd: Infinity, rate: 0.08, minFeeUsd: 0 },
];

/**
 * Calculate the service fee using the tiered model.
 * Returns { feeUsd, rate } where rate is the tier percentage applied.
 */
function calculateServiceFee(subtotalUsd: number): { feeUsd: number; rate: number } {
  const tier = SERVICE_FEE_TIERS.find((t) => subtotalUsd <= t.maxUsd) ?? SERVICE_FEE_TIERS[SERVICE_FEE_TIERS.length - 1]!;
  const calculated = roundTo2(subtotalUsd * tier.rate);
  const feeUsd = Math.max(calculated, tier.minFeeUsd);
  return { feeUsd: roundTo2(feeUsd), rate: tier.rate };
}

// ── Category default weights (last-resort fallback) ─────────────────────────

const CATEGORY_DEFAULT_WEIGHTS: Record<string, number> = {
  // From Pricing Model PDF — all in lbs
  "Cell Phones & Accessories": 0.5,
  "Tablets / iPads": 1.5,
  "Computers": 4.5,
  "Wearable Technology": 0.4,
  "Headphones": 0.5,
  "Audio": 0.5, // Earbuds default; speakers handled by size heuristic
  "Video Games": 8.0,  // Console default
  "Gaming": 8.0,
  "Other": 0.5, // General accessories
};

/** Get default weight for a product category (lbs) */
export function getCategoryDefaultWeight(category: string | null): number {
  if (!category) return 0.5;
  return CATEGORY_DEFAULT_WEIGHTS[category] ?? 0.5;
}

// ── Freight calculation ─────────────────────────────────────────────────────

export interface FreightInput {
  /** Actual weight in lbs (from scraping or internet search) */
  actualWeightLbs: number | null;
  /** Product dimensions in inches (for volumetric weight) */
  dimensions?: { lengthIn: number; widthIn: number; heightIn: number } | null;
  /** Product category for fallback default weight */
  category: string | null;
  /** How the weight was determined */
  weightSource: "scraped" | "internet_search" | "category_default";
}

export interface FreightResult {
  actualWeightLbs: number | null;
  volumetricWeightLbs: number | null;
  chargeableWeightLbs: number;
  freightUsd: number;
  weightSource: "scraped" | "internet_search" | "category_default";
}

/**
 * Calculate international freight cost based on chargeable weight.
 * Chargeable weight = MAX(actual weight, volumetric weight).
 * Freight = chargeable weight × $6.50/lb.
 */
export function calculateFreight(input: FreightInput): FreightResult {
  // Volumetric weight
  let volumetricWeightLbs: number | null = null;
  if (input.dimensions) {
    const { lengthIn, widthIn, heightIn } = input.dimensions;
    volumetricWeightLbs = roundTo2((lengthIn * widthIn * heightIn) / VOLUMETRIC_DIVISOR);
  }

  // Actual weight — use provided or fall back to category default
  let actualWeightLbs = input.actualWeightLbs;
  let weightSource = input.weightSource;
  if (actualWeightLbs == null || actualWeightLbs <= 0) {
    actualWeightLbs = getCategoryDefaultWeight(input.category);
    weightSource = "category_default";
  }

  // Chargeable weight = max of actual and volumetric
  const chargeableWeightLbs = Math.max(
    actualWeightLbs,
    volumetricWeightLbs ?? 0,
  );

  const freightUsd = roundTo2(chargeableWeightLbs * FREIGHT_RATE_PER_LB);

  return {
    actualWeightLbs,
    volumetricWeightLbs,
    chargeableWeightLbs,
    freightUsd,
    weightSource,
  };
}

/**
 * Apply the 4% currency buffer to a mid-market exchange rate.
 * Applied FX Rate = Mid-Market Rate × (1 + 4% Buffer)
 */
export function applyFxBuffer(midMarketRate: number): number {
  return roundTo2(midMarketRate * (1 + FX_BUFFER));
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Get all pricing configs (all regions).
 * Pass createAdminClient() — pricing_config is admin-managed data.
 */
export async function getAll(
  client: SupabaseClient,
): Promise<ServiceResult<PricingConfigListResponse>> {
  const configs = await getAllPricingConfigs(client);

  return {
    success: true,
    data: { configs: configs.map(toResponse) },
  };
}

/**
 * Update pricing config for a specific region (admin only).
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function updateRegionPricing(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  region: "USA" | "UK" | "CHINA",
  baseShippingFeeUsd: number,
  exchangeRate: number,
  serviceFeePercentage: number,
): Promise<ServiceResult<PricingConfigResponse>> {
  const current = await getPricingConfigByRegion(client, region);
  if (!current) {
    return { success: false, error: "Pricing config not found for region", status: 404 };
  }

  const updated = await updatePricingConfig(client, region, {
    base_shipping_fee_usd: baseShippingFeeUsd,
    exchange_rate: exchangeRate,
    service_fee_percentage: serviceFeePercentage,
    updated_by: admin.id,
  });

  if (!updated) {
    return { success: false, error: "Failed to update pricing config", status: 500 };
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

  return { success: true, data: toResponse(updated) };
}

/** Fallback pricing used when the DB has no row for a region yet. */
const FALLBACK_PRICING: Record<
  "USA" | "UK" | "CHINA",
  { base_shipping_fee_usd: number; exchange_rate: number; service_fee_percentage: number }
> = {
  USA:   { base_shipping_fee_usd: 15.00, exchange_rate: 14.50, service_fee_percentage: 0.10 },
  UK:    { base_shipping_fee_usd: 18.00, exchange_rate: 18.00, service_fee_percentage: 0.10 },
  CHINA: { base_shipping_fee_usd: 10.00, exchange_rate: 14.50, service_fee_percentage: 0.10 },
};

/**
 * Calculate the full pricing breakdown for an order.
 * System-level operation — uses admin client internally to read pricing_config.
 * Falls back to hardcoded defaults if the DB row is missing.
 * This is the SINGLE SOURCE OF TRUTH for all money math.
 *
 * **Method 1 (Fixed Freight):** When staticPriceId is provided:
 *   Customer Price (GHS) = (Item Price USD × Applied FX Rate) + Fixed Freight Rate (GHS)
 *
 * **Method 2 (Formula):** For unrecognised products:
 *   Customer Price (GHS) = (Item Price + Seller Shipping + Freight + Service Fee + Handling) × Applied FX Rate
 */
export async function calculatePricing(
  itemPriceUsd: number,
  quantity: number,
  region: "USA" | "UK" | "CHINA",
  options?: {
    /** If provided, use Method 1 (fixed freight from static price list) */
    staticPriceId?: string;
    /** Override for the static GHS freight rate (for range items) */
    staticPriceOverrideGhs?: number;
    /** Seller shipping cost in USD (default $0 if not detected) */
    sellerShippingUsd?: number;
    /** Freight input for weight-based calculation (Method 2 only) */
    freight?: FreightInput;
  },
): Promise<ServiceResult<OrderPricingBreakdown>> {
  // Read exchange rate config
  const config =
    (await getPricingConfigByRegion(createAdminClient(), region)) ??
    FALLBACK_PRICING[region];

  // Apply 4% FX buffer: Applied FX Rate = Mid-Market Rate × 1.04
  const midMarketRate = config.exchange_rate;
  const appliedFxRate = applyFxBuffer(midMarketRate);

  // ── Method 1: Fixed Freight Items ─────────────────────────────────────────
  if (options?.staticPriceId) {
    const { getById } = await import("./static-pricing.service");
    const result = await getById(options.staticPriceId);

    if (!result.success) {
      return { success: false, error: result.error, status: result.status };
    }

    const staticItem = result.data;
    let fixedFreightGhs = staticItem.priceGhs;

    // Allow admin override for range-priced items
    if (options.staticPriceOverrideGhs != null) {
      const min = staticItem.priceMinGhs ?? fixedFreightGhs;
      const max = staticItem.priceMaxGhs ?? fixedFreightGhs;
      if (options.staticPriceOverrideGhs < min || options.staticPriceOverrideGhs > max) {
        return {
          success: false,
          error: `Price override GH₵ ${options.staticPriceOverrideGhs} is outside allowed range GH₵ ${min} – GH₵ ${max}`,
          status: 400,
        };
      }
      fixedFreightGhs = options.staticPriceOverrideGhs;
    }

    // Method 1 formula: (Item Price USD × Applied FX Rate) + Fixed Freight Rate (GHS)
    const subtotalUsd = roundTo2(itemPriceUsd * quantity);
    const itemPriceGhs = roundTo2(subtotalUsd * appliedFxRate);
    const freightGhs = roundTo2(fixedFreightGhs * quantity);
    const totalGhs = roundTo2(itemPriceGhs + freightGhs);
    const totalPesewas = Math.round(totalGhs * 100);

    return {
      success: true,
      data: {
        item_price_usd: itemPriceUsd,
        quantity,
        subtotal_usd: subtotalUsd,
        seller_shipping_usd: 0,
        freight_usd: 0,
        service_fee_usd: 0,
        handling_fee_usd: 0,
        total_usd: subtotalUsd,
        mid_market_rate: midMarketRate,
        exchange_rate: appliedFxRate,
        total_ghs: totalGhs,
        total_pesewas: totalPesewas,
        region,
        service_fee_percentage: 0,
        is_static_price: true,
        static_price_id: options.staticPriceId,
      },
    };
  }

  // ── Method 2: Formula-Based Pricing ───────────────────────────────────────
  // Customer Price (GHS) = (Item Price + Seller Shipping + Freight + Service Fee + Handling) × Applied FX Rate

  const subtotalUsd = roundTo2(itemPriceUsd * quantity);
  const sellerShippingUsd = roundTo2(options?.sellerShippingUsd ?? 0);

  // Freight: weight-based calculation or fallback to category default
  const freightResult = options?.freight
    ? calculateFreight(options.freight)
    : calculateFreight({
        actualWeightLbs: null,
        dimensions: null,
        category: null,
        weightSource: "category_default",
      });
  const freightUsd = roundTo2(freightResult.freightUsd);

  const { feeUsd: serviceFeeUsd, rate: serviceFeeRate } = calculateServiceFee(subtotalUsd);
  const handlingFeeUsd = HANDLING_FEE_USD;

  const totalUsd = roundTo2(subtotalUsd + sellerShippingUsd + freightUsd + serviceFeeUsd + handlingFeeUsd);
  const totalGhs = roundTo2(totalUsd * appliedFxRate);
  const totalPesewas = Math.round(totalGhs * 100);

  return {
    success: true,
    data: {
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      seller_shipping_usd: sellerShippingUsd,
      freight_usd: freightUsd,
      service_fee_usd: serviceFeeUsd,
      handling_fee_usd: handlingFeeUsd,
      total_usd: totalUsd,
      mid_market_rate: midMarketRate,
      exchange_rate: appliedFxRate,
      total_ghs: totalGhs,
      total_pesewas: totalPesewas,
      region,
      service_fee_percentage: serviceFeeRate,
      weight: {
        actual_lbs: freightResult.actualWeightLbs,
        volumetric_lbs: freightResult.volumetricWeightLbs,
        chargeable_lbs: freightResult.chargeableWeightLbs,
        source: freightResult.weightSource,
      },
      is_static_price: false,
      static_price_id: null,
    },
  };
}
