import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/features/auth/types";
import type { DbOrder, DbOrderDelivery } from "@/types/db";
import type { Order } from "@/features/orders/types";
import type { Delivery, DeliveryStats } from "../types";

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

async function getOrderDeliveryRecords(
  client: SupabaseClient,
  orderIds: string[],
): Promise<DbOrderDelivery[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await client
    .from("order_deliveries")
    .select("*")
    .in("order_id", orderIds);
  if (error) {
    logger.error("getOrderDeliveryRecords failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbOrderDelivery[];
}

export interface DeliveryResponse {
  deliveries: Delivery[];
  count: number;
  stats: DeliveryStats;
}

export async function listDeliveries(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<DeliveryResponse> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const orders = await getDeliveries(client);

  // Enrich with tracking_url and notes from order_deliveries
  const deliveryRecords = await getOrderDeliveryRecords(
    client,
    orders.map((o) => o.id),
  );
  const deliveryMap = new Map(deliveryRecords.map((d) => [d.order_id, d]));

  const deliveries: Delivery[] = (orders as Order[]).map((o) => ({
    ...o,
    tracking_url: deliveryMap.get(o.id)?.tracking_url ?? null,
    delivery_notes: deliveryMap.get(o.id)?.notes ?? null,
  }));

  const stats: DeliveryStats = {
    total: orders.length,
    pendingDispatch: orders.filter((o) => o.status === "processing").length,
    inTransit: orders.filter((o) => o.status === "in_transit").length,
    delivered: orders.filter(
      (o) => o.status === "delivered" || o.status === "completed",
    ).length,
  };

  return { deliveries, count: deliveries.length, stats };
}
