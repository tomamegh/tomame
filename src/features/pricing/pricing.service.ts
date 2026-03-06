import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAllPricingConfigs,
  getPricingConfigByRegion,
  updatePricingConfig,
} from "@/features/pricing/pricing.queries";
import { logAuditEvent } from "@/features/audit/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  PricingConfigResponse,
  PricingConfigListResponse,
} from "@/features/pricing/types";
import type { OrderPricingBreakdown } from "@/types/db";

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
 * Formula: total_ghs = (item_price * qty + shipping + service_fee) * exchange_rate
 * Where: service_fee = item_price * qty * service_fee_percentage
 */
export async function calculatePricing(
  itemPriceUsd: number,
  quantity: number,
  region: "USA" | "UK" | "CHINA",
): Promise<ServiceResult<OrderPricingBreakdown>> {
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
    },
  };
}

/** Round to 2 decimal places (avoids floating-point drift) */
function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
