import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbPricingConfig } from "@/types/db";
import { logger } from "@/lib/logger";

export async function getPricingConfigByRegion(
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

export async function getAllPricingConfigs(
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

export async function updatePricingConfig(
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
