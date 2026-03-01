import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById, updateOrderReview } from "@/features/orders/orders.queries";
import { logAuditEvent } from "@/features/audit/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { Order } from "./types";
import type { DbOrder } from "@/types/db";

/** Map a DB order row to the API response shape */
function toResponse(order: DbOrder): Order {
  return {
    id: order.id,
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
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

/**
 * Admin: review a flagged order (approve or reject).
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function reviewOrder(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  orderId: string,
  input: {
    action: "approve" | "reject";
    updates?: {
      productName?: string;
      estimatedPriceUsd?: number;
      productImageUrl?: string | null;
      originCountry?: "USA" | "UK" | "CHINA";
    };
    reason?: string;
  },
): Promise<ServiceResult<Order>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const order = await getOrderById(client, orderId);
  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }

  if (!order.needs_review) {
    return { success: false, error: "Order is not flagged for review", status: 400 };
  }

  if (input.action === "approve") {
    const updates: Record<string, unknown> = {
      needs_review: false,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    };

    if (input.updates?.productName) {
      updates.product_name = input.updates.productName;
    }
    if (input.updates?.estimatedPriceUsd !== undefined) {
      updates.estimated_price_usd = input.updates.estimatedPriceUsd;
    }
    if (input.updates?.productImageUrl !== undefined) {
      updates.product_image_url = input.updates.productImageUrl;
    }
    if (input.updates?.originCountry) {
      updates.origin_country = input.updates.originCountry;
    }

    const updated = await updateOrderReview(client, orderId, updates);
    if (!updated) {
      return { success: false, error: "Failed to approve order", status: 500 };
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

    return { success: true, data: toResponse(updated) };
  }

  // Reject: cancel the order
  const updated = await updateOrderReview(client, orderId, {
    needs_review: false,
    reviewed_by: admin.id,
    reviewed_at: new Date().toISOString(),
    status: "cancelled",
  });

  if (!updated) {
    return { success: false, error: "Failed to reject order", status: 500 };
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

  return { success: true, data: toResponse(updated) };
}
