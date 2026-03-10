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
 * If a static_price_id is provided and valid, the total is the fixed GHS amount
 * from the static price list — no shipping, service fee, or exchange rate applied.
 *
 * Otherwise, uses the dynamic formula:
 * total_ghs = (item_price * qty + shipping + service_fee) * exchange_rate
 * Where: service_fee = item_price * qty * service_fee_percentage
 */
export async function calculatePricing(
  itemPriceUsd: number,
  quantity: number,
  region: "USA" | "UK" | "CHINA",
  options?: {
    /** If provided, use the fixed GHS price from the static price list */
    staticPriceId?: string;
    /** Override for the static GHS price (for range items where admin picks the exact price) */
    staticPriceOverrideGhs?: number;
  },
): Promise<ServiceResult<OrderPricingBreakdown>> {
  // ── Static pricing path ──────────────────────────────────────────────────
  if (options?.staticPriceId) {
    const { getById } = await import("./static-pricing.service");
    const result = await getById(options.staticPriceId);

    if (!result.success) {
      return { success: false, error: result.error, status: result.status };
    }

    const staticItem = result.data;
    let priceGhs = staticItem.priceGhs;

    // Allow admin override for range-priced items
    if (options.staticPriceOverrideGhs != null) {
      const min = staticItem.priceMinGhs ?? priceGhs;
      const max = staticItem.priceMaxGhs ?? priceGhs;
      if (options.staticPriceOverrideGhs < min || options.staticPriceOverrideGhs > max) {
        return {
          success: false,
          error: `Price override GH₵ ${options.staticPriceOverrideGhs} is outside allowed range GH₵ ${min} – GH₵ ${max}`,
          status: 400,
        };
      }
      priceGhs = options.staticPriceOverrideGhs;
    }

    const totalGhs = roundTo2(priceGhs * quantity);
    const totalPesewas = Math.round(totalGhs * 100);

    return {
      success: true,
      data: {
        item_price_usd: itemPriceUsd,
        quantity,
        subtotal_usd: 0,
        shipping_fee_usd: 0,
        service_fee_usd: 0,
        total_usd: 0,
        exchange_rate: 0,
        total_ghs: totalGhs,
        total_pesewas: totalPesewas,
        region,
        service_fee_percentage: 0,
        is_static_price: true,
        static_price_id: options.staticPriceId,
      },
    };
  }

  // ── Dynamic pricing path (existing formula) ──────────────────────────────
  const config =
    (await getPricingConfigByRegion(createAdminClient(), region)) ??
    FALLBACK_PRICING[region];

  const subtotalUsd = roundTo2(itemPriceUsd * quantity);
  const shippingFeeUsd = roundTo2(config.base_shipping_fee_usd);
  const serviceFeeUsd = roundTo2(subtotalUsd * config.service_fee_percentage);
  const totalUsd = roundTo2(subtotalUsd + shippingFeeUsd + serviceFeeUsd);
  const totalGhs = roundTo2(totalUsd * config.exchange_rate);
  const totalPesewas = Math.round(totalGhs * 100);

  return {
    success: true,
    data: {
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      shipping_fee_usd: shippingFeeUsd,
      service_fee_usd: serviceFeeUsd,
      total_usd: totalUsd,
      exchange_rate: config.exchange_rate,
      total_ghs: totalGhs,
      total_pesewas: totalPesewas,
      region,
      service_fee_percentage: config.service_fee_percentage,
      is_static_price: false,
      static_price_id: null,
    },
  };
}
