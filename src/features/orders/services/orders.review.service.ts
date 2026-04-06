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
    admin_total_ghs: number;
    admin_pricing_note: string | null;
    pricing_set_by: string;
    pricing_set_at: string;
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
    action: "approve" | "reject" | "set_price";
    updates?: {
      product_name?: string;
      estimated_price_usd?: number;
      product_image_url?: string | null;
      origin_country?: "USA" | "UK" | "CHINA";
    };
    reason?: string;
    admin_total_ghs?: number;
    admin_pricing_note?: string;
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

  // Set price: admin manually sets the GHS total for a needs_review order
  if (input.action === "set_price") {
    if (!input.admin_total_ghs || input.admin_total_ghs <= 0) {
      throw new APIError(400, "A positive GHS price is required");
    }

    const now = new Date().toISOString();
    const priceUpdates: Record<string, unknown> = {
      needs_review: false,
      reviewed_by: admin.id,
      reviewed_at: now,
      admin_total_ghs: input.admin_total_ghs,
      admin_pricing_note: input.admin_pricing_note ?? null,
      pricing_set_by: admin.id,
      pricing_set_at: now,
    };

    // Also apply any product detail corrections
    if (input.updates?.product_name) {
      priceUpdates.product_name = input.updates.product_name;
    }
    if (input.updates?.estimated_price_usd !== undefined) {
      priceUpdates.estimated_price_usd = input.updates.estimated_price_usd;
    }
    if (input.updates?.origin_country) {
      priceUpdates.origin_country = input.updates.origin_country;
    }

    const priceUpdated = await updateOrderReview(client, orderId, priceUpdates);
    if (!priceUpdated) {
      throw new APIError(500, "Failed to set price on order");
    }

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "order_price_set",
      entityType: "order",
      entityId: orderId,
      metadata: {
        admin_total_ghs: input.admin_total_ghs,
        admin_pricing_note: input.admin_pricing_note ?? null,
        previousReviewReasons: order.review_reasons,
        updates: input.updates ?? null,
      },
    });

    return priceUpdated as Order;
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
