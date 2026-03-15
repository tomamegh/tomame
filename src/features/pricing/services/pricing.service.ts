import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
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

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
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
 * Falls back to hardcoded defaults if the DB row is missing.
 * Single source of truth for all money math.
 */
export async function calculatePricing(
  itemPriceUsd: number,
  quantity: number,
  region: "USA" | "UK" | "CHINA",
): Promise<OrderPricingBreakdown> {
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
  };
}
