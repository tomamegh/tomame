import type { JwtPayload, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getOrderById } from "@/features/orders/services/orders.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { Order } from "../types";

// ── DB queries ────────────────────────────────────────────────────────────────

async function updateOrderReview(
  client: SupabaseClient,
  orderId: string,
  updates: Partial<{
    needs_review: boolean;
    review_reasons: string[];
    reviewed_by: string;
    reviewed_at: string;
    product_name: string;
    product_image_url: string | null;
    estimated_price_usd: number;
    origin_country: string;
    status: string;
  }>,
): Promise<Order | null> {
  const { data, error } = await client
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    logger.error("updateOrderReview failed", {
      orderId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as Order;
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function reviewOrder(
  client: SupabaseClient,
  admin: JwtPayload,
  orderId: string,
  input: {
    action: "approve" | "reject";
    updates?: {
      product_name?: string;
      estimated_price_usd?: number;
      product_image_url?: string | null;
      origin_country?: "USA" | "UK" | "CHINA";
    };
    reason?: string;
  },
): Promise<Order> {
  if (admin.app_metadata?.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const order = await getOrderById(client, orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  if (!order.needs_review) {
    throw new APIError(400, "Order is not flagged for review");
  }

  if (input.action === "approve") {
    const updates: Record<string, unknown> = {
      needs_review: false,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    };

    if (input.updates?.product_name) {
      updates.product_name = input.updates.product_name;
    }
    if (input.updates?.estimated_price_usd !== undefined) {
      updates.estimated_price_usd = input.updates.estimated_price_usd;
    }
    if (input.updates?.product_image_url !== undefined) {
      updates.product_image_url = input.updates.product_image_url;
    }
    if (input.updates?.origin_country) {
      updates.origin_country = input.updates.origin_country;
    }

    const updated = await updateOrderReview(client, orderId, updates);
    if (!updated) {
      throw new APIError(500, "Failed to approve order");
    }

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "order_review_approved",
      entityType: "order",
      entityId: orderId,
      metadata: {
        updates: input.updates ?? null,
        previousReviewReasons: order.review_reasons,
      },
    });

    return updated as Order;
  }

  // Reject: cancel the order
  const updated = await updateOrderReview(client, orderId, {
    needs_review: false,
    reviewed_by: admin.id,
    reviewed_at: new Date().toISOString(),
    status: "cancelled",
  });

  if (!updated) {
    throw new APIError(500, "Failed to reject order");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "order_review_rejected",
    entityType: "order",
    entityId: orderId,
    metadata: {
      reason: input.reason ?? null,
      previousReviewReasons: order.review_reasons,
    },
  });

  return updated as Order;
}
