import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getOrderById } from "@/features/orders/services/orders.service";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/transport";
import {
  orderApprovedTemplate,
  orderRejectedTemplate,
} from "@/lib/email/templates/order-status";
import { env } from "@/lib/env";
import { APIError } from "@/lib/auth/api-helpers";
import type { Order, OrderReviewInput, OrderReviewUpdates } from "../types";
import { PlatformUser } from "@/features/users/types";

// ── DB queries ────────────────────────────────────────────────────────────────

async function updateOrderReview(
  orderId: string,
  updates: Partial<OrderReviewUpdates>,
): Promise<Order | null> {
  const { data, error } = await createAdminClient()
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

/** Mark any pending payments for this order as failed so the customer can re-pay at the new price. */
async function voidPendingPaymentsForOrder(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("payments")
    .update({ status: "failed", metadata: { voided_reason: "order_repriced" } })
    .filter("metadata->>order_id", "eq", orderId)
    .eq("status", "pending");

  if (error) {
    logger.error("voidPendingPaymentsForOrder failed", {
      orderId,
      error: error.message,
    });
  }
}

/** Send a review outcome email to the order owner. Errors are logged, never thrown. */
async function sendReviewEmail(
  userId: string,
  order: Order,
  action: "approve" | "reject",
  opts: { priceChanged: boolean; reason?: string },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: userData, error } =
      await admin.auth.admin.getUserById(userId);
    if (error || !userData?.user?.email) return;

    const paymentUrl =
      action === "approve"
        ? `${env.app.url}/app/orders/${order.id}`
        : undefined;

    const p = order.pricing;
    const template =
      action === "approve"
        ? orderApprovedTemplate({
            productName: order.product_name,
            orderId: order.id,
            totalGhs: p.total_ghs,
            pricing:
              p.pricing_method !== "needs_review"
                ? {
                    itemPriceUsd: p.item_price_usd,
                    subtotalUsd: p.subtotal_usd,
                    taxPercentage: p.tax_percentage,
                    taxUsd: p.tax_usd,
                    valueFeePercentage: p.value_fee_percentage,
                    valueFeeUsd: p.value_fee_usd,
                    flatRateGhs: p.flat_rate_ghs,
                    exchangeRate: p.exchange_rate,
                    totalGhs: p.total_ghs,
                  }
                : undefined,
            priceChanged: opts.priceChanged,
            paymentUrl,
          })
        : orderRejectedTemplate({
            productName: order.product_name,
            orderId: order.id,
            reason: opts.reason,
          });

    await sendEmail({
      to: userData.user.email,
      subject: template.subject,
      html: template.html,
    });
  } catch (err) {
    logger.error("sendReviewEmail failed", {
      userId,
      orderId: order.id,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

const REGION_MAP = { USA: "usa", UK: "uk", CHINA: "china" } as const;

export async function reviewOrder(
  client: SupabaseClient,
  admin: PlatformUser,
  orderId: string,
  input: OrderReviewInput,
): Promise<Order> {
  const order = await getOrderById(client, orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  if (!order.needs_review) {
    throw new APIError(400, "Order is not flagged for review");
  }

  if (input.action === "approve") {
    const newPrice =
      input.updates?.estimated_price_usd ?? order.estimated_price_usd;
    const newCountry = input.updates?.origin_country ?? order.origin_country;
    const priceChanged =
      input.updates?.estimated_price_usd !== undefined &&
      input.updates.estimated_price_usd !== order.estimated_price_usd;
    const countryChanged =
      input.updates?.origin_country !== undefined &&
      input.updates.origin_country !== order.origin_country;

    const updates: Record<string, unknown> = {
      needs_review: false,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    };

    if (input.updates?.product_name)
      updates.product_name = input.updates.product_name;
    if (input.updates?.estimated_price_usd !== undefined)
      updates.estimated_price_usd = input.updates.estimated_price_usd;
    if (input.updates?.product_image_url !== undefined)
      updates.product_image_url = input.updates.product_image_url;
    if (input.updates?.origin_country)
      updates.origin_country = input.updates.origin_country;

    // Always recalculate pricing on approval so pricing_method is never "needs_review"
    // after approval (checkout page and email both require a resolved pricing method).
    const newPricing = await calculatePricing({
      itemPriceUsd: newPrice,
      quantity: order.quantity,
      category: order.extraction_metadata?.product?.category ?? null,
      weightLbs: order.pricing.weight_lbs ?? undefined,
      region: REGION_MAP[newCountry],
    });
    updates.pricing = newPricing as unknown as Record<string, unknown>;

    if (priceChanged || countryChanged) {
      // Void any pending payment so the customer re-pays at the updated price
      await voidPendingPaymentsForOrder(orderId);
    }

    const updated = await updateOrderReview(orderId, updates);
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
        priceChanged,
        countryChanged,
        previousReviewReasons: order.review_reasons,
      },
    });

    sendReviewEmail(order.user_id, updated, "approve", { priceChanged });

    return updated as Order;
  }

  // Reject: cancel the order
  const updated = await updateOrderReview(orderId, {
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

  sendReviewEmail(order.user_id, updated, "reject", {
    priceChanged: false,
    reason: input.reason,
  });

  return updated as Order;
}
