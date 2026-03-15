import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toResponse(order: DbOrder): Order {
  return {
    id: order.id,
    userId: order.user_id,
    productUrl: order.product_url,
    productName: order.product_name,
    productImageUrl: order.product_image_url,
    estimatedPriceUsd: order.estimated_price_usd,
    quantity: order.quantity,
    originCountry: order.origin_country,
    specialInstructions: order.special_instructions,
    status: order.status,
    pricing: order.pricing,
    needsReview: order.needs_review,
    reviewReasons: order.review_reasons,
    reviewedBy: order.reviewed_by,
    reviewedAt: order.reviewed_at,
    extractionMetadata: order.extraction_metadata,
    extractionData: order.extraction_data,
    trackingNumber: order.tracking_number,
    carrier: order.carrier,
    estimatedDeliveryDate: order.estimated_delivery_date,
    deliveredAt: order.delivered_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
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
): Promise<ServiceResult<DeliveryResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const orders = await getDeliveries(client);
  const mapped = orders.map(toResponse);

  const stats: DeliveryStats = {
    total: mapped.length,
    pendingDispatch: mapped.filter((o) => o.status === "processing").length,
    inTransit: mapped.filter((o) => o.status === "in_transit").length,
    delivered: mapped.filter(
      (o) => o.status === "delivered" || o.status === "completed",
    ).length,
  };

  return {
    success: true,
    data: { deliveries: mapped, count: mapped.length, stats },
  };
}
