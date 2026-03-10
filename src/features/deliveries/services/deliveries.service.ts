import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
import type { DbOrder } from "@/types/db";
import type { Order } from "@/features/orders/types";
import type { DeliveryStats } from "../types";

// ── DB queries ────────────────────────────────────────────────────────────────

const DELIVERY_STATUSES = [
  "processing",
  "in_transit",
  "delivered",
  "completed",
] as const;

async function getDeliveries(
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

// ── Service functions ─────────────────────────────────────────────────────────

export interface DeliveryResponse {
  deliveries: Order[];
  count: number;
  stats: DeliveryStats;
}

export async function listDeliveries(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<DeliveryResponse> {
  if (user.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const orders = await getDeliveries(client);

  const stats: DeliveryStats = {
    total: orders.length,
    pendingDispatch: orders.filter((o) => o.status === "processing").length,
    inTransit: orders.filter((o) => o.status === "in_transit").length,
    delivered: orders.filter(
      (o) => o.status === "delivered" || o.status === "completed",
    ).length,
  };

  return { deliveries: orders as Order[], count: orders.length, stats };
}
