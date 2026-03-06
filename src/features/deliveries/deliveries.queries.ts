import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbOrder } from "@/types/db";
import { logger } from "@/lib/logger";

export const DELIVERY_STATUSES = [
  "processing",
  "in_transit",
  "delivered",
  "completed",
] as const;

export async function getDeliveries(
  client: SupabaseClient,
  filters?: { status?: string; originCountry?: string },
): Promise<DbOrder[]> {
  const statuses =
    filters?.status && DELIVERY_STATUSES.includes(filters.status as (typeof DELIVERY_STATUSES)[number])
      ? [filters.status]
      : [...DELIVERY_STATUSES];

  let query = client
    .from("orders")
    .select("*")
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (filters?.originCountry) {
    query = query.eq("origin_country", filters.originCountry);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("getDeliveries failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbOrder[];
}
