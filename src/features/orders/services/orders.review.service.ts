import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { REGION_TO_PRICING } from "@/features/extraction/url";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getOrderById } from "@/features/orders/services/orders.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { freightCorrectionPatch } from "@/features/pricing/freight-inspection";
import { getQuoteLockById } from "@/db/queries/quote-locks";
import { isLockUnexpired, priceLowerOf } from "@/features/quotes/services/quote-lock.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { whatsappMessages } from "@/lib/whatsapp/templates";
import { notifyStaff } from "@/features/staff-alerts/notify";
import { sendEmail } from "@/lib/email/transport";
import {
  orderApprovedTemplate,
  orderRejectedTemplate,
} from "@/lib/email/templates/order-status";
import { env } from "@/lib/env";
import { APIError } from "@/lib/auth/api-helpers";
import type { Order, OrderReviewInput, OrderReviewUpdates, OriginCountry } from "../types";
import { orderStoreShippingCurrency, orderStoreShippingPerUnit } from "../store-shipping";
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
    await queueWhatsApp({
      userId,
      event: action === "approve" ? "order_approved" : "order_rejected",
      dedupeKey: `order_review:${order.id}:${action}`,
      message: whatsappMessages.orderReviewed({
        orderId: order.id,
        productName: order.product_name,
        approved: action === "approve",
        totalGhs: Number(order.admin_total_ghs ?? order.pricing.total_ghs ?? 0),
        reason: opts.reason,
      }),
    });

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
                    storeShippingUsd: p.store_shipping_usd ?? 0,
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

/**
 * The per-unit store shipping to re-price an order with, in the listing
 * currency. The order's own breakdown is the authority — never the extraction
 * snapshot, which could carry shipping the customer was not quoted (a lock that
 * kept it out). An admin override replaces it: this is how "Store shipping
 * couldn't be confirmed… may be added at review" is honoured, and how a lower
 * per-unit figure is entered when the seller combines shipping.
 */
export function storeShippingOf(
  order: Pick<Order, "pricing" | "extraction_metadata">,
  country: OriginCountry,
  override?: number,
): { storeShipping: number | null; storeShippingCurrency?: string } {
  if (override !== undefined) {
    return { storeShipping: override, storeShippingCurrency: orderStoreShippingCurrency(order, country) };
  }
  const p = order.pricing;
  if (typeof p.store_shipping === "number" && p.store_shipping_currency) {
    return { storeShipping: p.store_shipping, storeShippingCurrency: p.store_shipping_currency };
  }
  return { storeShipping: null };
}

// ── Service functions ─────────────────────────────────────────────────────────


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
    const shippingOverride = input.updates?.store_shipping;
    const previousStoreShipping = orderStoreShippingPerUnit(order);
    const storeShippingChanged =
      shippingOverride !== undefined && shippingOverride !== previousStoreShipping;

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
    // An order placed under a rate lock is re-priced by the same rule the
    // customer was quoted under — the lower of locked and live total — for as
    // long as the lock is unexpired. The FX comes from the lock ROW (never the
    // order's stored breakdown), and the lock fields are kept only when the
    // locked pricing won. An expired or missing lock means today's rate.
    const calculator = await loadPricingCalculator();
    // The freight inspector's correction the customer was quoted with (category /
    // weight / fixed item), kept while the snapshot and fixed-freight table still
    // match it — unless the admin renamed the product, which re-decides freight.
    const snapshot = order.extraction_metadata;
    const correction =
      snapshot?.freight_inspection && snapshot.product && !input.updates?.product_name
        ? freightCorrectionPatch(snapshot.freight_inspection, snapshot.product, calculator.activeFixedFreightItems.map((i) => i.id))
        : null;
    const pricingInput = {
      itemPriceUsd: newPrice,
      quantity: order.quantity,
      category: order.extraction_metadata?.product?.category ?? null,
      weightLbs: order.extraction_metadata?.product?.weight_lbs ?? order.pricing.weight_lbs ?? undefined,
      productTitle: input.updates?.product_name ?? order.product_name,
      region: REGION_TO_PRICING[newCountry],
      // The store shipping the customer was quoted (per unit, listed currency),
      // or the admin's override of it.
      ...storeShippingOf(order, newCountry, shippingOverride),
      ...correction,
    };
    const lock = order.pricing.rate_lock_id ? await getQuoteLockById(order.pricing.rate_lock_id) : null;
    const live = await calculator.calculate(pricingInput, null);
    const newPricing =
      lock && isLockUnexpired(lock)
        ? await priceLowerOf({
            lock,
            live,
            priceAt: (fx) => calculator.calculate(pricingInput, fx),
            onLiveWins: { ratchet: false },
          })
        : live;
    updates.pricing = newPricing as unknown as Record<string, unknown>;

    if (priceChanged || countryChanged || storeShippingChanged) {
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
        storeShippingChanged,
        ...(shippingOverride !== undefined
          ? {
              store_shipping: {
                from: previousStoreShipping,
                to: shippingOverride,
                currency: orderStoreShippingCurrency(order, newCountry),
                quantity: order.quantity,
              },
            }
          : {}),
        previousReviewReasons: order.review_reasons,
      },
    });

    sendReviewEmail(order.user_id, updated, "approve", { priceChanged: priceChanged || storeShippingChanged });
    notifyStaff({ kind: "order_review", orderId, outcome: "approved" });

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

    const priceUpdated = await updateOrderReview(orderId, priceUpdates);
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

    notifyStaff({ kind: "order_review", orderId, outcome: "priced" });
    return priceUpdated as Order;
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

  notifyStaff({ kind: "order_review", orderId, outcome: "rejected" });
  sendReviewEmail(order.user_id, updated, "reject", {
    priceChanged: false,
    reason: input.reason,
  });

  return updated as Order;
}
