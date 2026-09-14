import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { buildOrderIntake } from "./order-intake.service";
import { allowedTransitionsFrom } from "./order-transitions";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { sendEmail } from "@/lib/email/transport";
import {
  orderPlacedTemplate,
  orderPaidTemplate,
  orderProcessingTemplate,
  orderShippedTemplate,
  orderDeliveredTemplate,
  orderCancelledTemplate,
} from "@/lib/email/templates/order-status";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import type { AuditLog } from "@/features/audit/types";
import { Order, OrderList } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateOrderSchemaType } from "../schema";
import { consumeQuoteLocksForOrder } from "@/features/quotes/services/quote-lock.service";
import { eventForStatus, recordOrderEvent } from "./order-events.service";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import type { Viewer } from "@/features/quotes/types";
import { mayEmailUser } from "@/lib/email/notify-preference";

export async function getOrderById(
  client: SupabaseClient,
  orderId: string,
): Promise<Order | null> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error) return null;
  return data as Order;
}

async function upsertOrderDelivery(
  client: SupabaseClient,
  orderId: string,
  userId: string,
  fields: {
    carrier?: string;
    tracking_number?: string;
    tracking_url?: string;
    estimated_delivery_date?: string;
    /** 050: mirrored from `orders` so the deliveries console sees the same window. */
    eta_from?: string;
    eta_to?: string;
    delivered_at?: string;
    notes?: string;
    status: string;
  },
): Promise<void> {
  const { error } = await client
    .from("order_deliveries")
    .upsert(
      { order_id: orderId, user_id: userId, ...fields },
      { onConflict: "order_id" },
    );
  if (error) {
    logger.error("upsertOrderDelivery failed", {
      orderId,
      error: error.message,
    });
  }
}

async function updateOrderStatus(
  client: SupabaseClient,
  orderId: string,
  updates: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    estimated_delivery_date?: string;
    eta_from?: string;
    eta_to?: string;
    delivered_at?: string;
  },
): Promise<Order | null> {
  const { data, error } = await client
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    logger.error("updateOrderStatus failed", {
      orderId,
      status: updates.status,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as Order;
}

/**
 * pending → paid, guarded on the current status.
 *
 * A group payment fans this out over N orders, and the callback and the webhook
 * can both reach the fan-out (the payment-row claim serialises them, but a
 * partial earlier run can leave some orders already paid). `.eq("status",
 * "pending")` makes each order flip exactly once; null means "already paid,
 * skip the follow-on effects" — never a database failure, which logs and also
 * returns null so a caller cannot tell the two apart by accident: check the log.
 */
export async function linkOrderToPayment(
  client: SupabaseClient,
  orderId: string,
  paymentId: string,
): Promise<Order | null> {
  const { data, error } = await client
    .from("orders")
    .update({ payment_id: paymentId, status: "paid" })
    .eq("id", orderId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    logger.error("linkOrderToPayment failed", {
      orderId,
      paymentId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data as Order | null) ?? null;
}

async function getOrdersByUserId(
  client: SupabaseClient,
  userId: string,
): Promise<Order[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getOrdersByUserId failed", { userId, error: error.message });
    throw new APIError(500, 'An error occurred while fetching your orders')
  }
  return (data ?? []) as Order[];
}

async function getAllOrders(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; needsReview?: boolean },
): Promise<Order[]> {
  let query = client
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);
  if (filters?.needsReview !== undefined) {
    query = query.eq("needs_review", filters.needsReview);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("getAllOrders failed", { error: error.message });
    throw new APIError(500, 'An error occurred while fetching orders')
  }
  return (data ?? []) as Order[];
}

async function getOrderAuditLogs(
  client: SupabaseClient,
  orderId: string,
): Promise<AuditLog[]> {
  const { data, error } = await client
    .from("audit_logs")
    .select("*")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("getOrderAuditLogs failed", { orderId, error: error.message });
    return [];
  }
  return (data ?? []) as AuditLog[];
}

export async function sendOrderStatusEmail(
  userId: string,
  order: Order,
  newStatus: string,
  trackingData?: {
    trackingNumber?: string;
    carrier?: string;
    estimatedDeliveryDate?: string;
  },
): Promise<void> {
  try {
    // `profiles.notify_email` — the account screen's "Email" toggle, whose own
    // description names these messages. Checked here rather than at each call
    // site so no future sender can forget it.
    if (!(await mayEmailUser(userId))) return;

    const supabase = createAdminClient();
    const { data: userData, error } =
      await supabase.auth.admin.getUserById(userId);
    if (error || !userData?.user?.email) return;

    const emailData = {
      productName: order.product_name,
      orderId: order.id,
      trackingNumber: trackingData?.trackingNumber,
      carrier: trackingData?.carrier,
      estimatedDeliveryDate: trackingData?.estimatedDeliveryDate,
    };

    let template: { subject: string; html: string } | null = null;

    switch (newStatus) {
      case "paid":
        template = orderPaidTemplate(emailData);
        break;
      case "processing":
        template = orderProcessingTemplate(emailData);
        break;
      case "in_transit":
        template = orderShippedTemplate(emailData);
        break;
      case "delivered":
        template = orderDeliveredTemplate(emailData);
        break;
      case "cancelled":
        template = orderCancelledTemplate(emailData);
        break;
    }

    if (template) {
      await sendEmail({
        to: userData.user.email,
        subject: template.subject,
        html: template.html,
      });
    }
  } catch (err) {
    logger.error("sendOrderStatusEmail failed", {
      userId,
      orderId: order.id,
      newStatus,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

/** How a bag checkout ties each order to its group, box and address (048). */
export interface CreateOrderLinks {
  order_group_id?: string | null;
  consolidation_box_id?: string | null;
  delivery_address_id?: string | null;
  /** The group's "paid" email covers its orders; skip the per-order "placed" one. */
  suppress_placed_email?: boolean;
}

export async function createOrder(
  client: SupabaseClient,
  user: PlatformUser,
  input: CreateOrderSchemaType,
  viewer: Viewer,
  links: CreateOrderLinks = {},
): Promise<Order> {
  // Every money-relevant field is decided server-side from the extraction
  // snapshot and the viewer's rate lock. See order-intake.service.ts — the
  // client never sets pricing, a rate, or a lock id.
  const intake = await buildOrderIntake(input, viewer);
  const { pricing, needs_review: needsReview, review_reasons: reviewReasons } = intake;

  const orderToCreate = {
    user_id: user.id,
    product_url: intake.product_url,
    product_name: intake.product_name,
    product_image_url: intake.product_image_url,
    estimated_price_usd: intake.estimated_price_usd,
    quantity: input.quantity,
    origin_country: intake.origin_country,
    special_instructions: input.special_instructions ?? null,
    pricing,
    status: "pending",
    needs_review: needsReview,
    review_reasons: reviewReasons,
    extraction_metadata: (intake.extraction_metadata ?? null) as Record<string, unknown> | null,
    extraction_cache_id: intake.extraction_cache_id,
    ...(links.order_group_id !== undefined && { order_group_id: links.order_group_id }),
    ...(links.consolidation_box_id !== undefined && { consolidation_box_id: links.consolidation_box_id }),
    ...(links.delivery_address_id !== undefined && { delivery_address_id: links.delivery_address_id }),
  };

  const { data: order, error } = await client
    .from("orders")
    .insert(orderToCreate)
    .select()
    .single();

  if (error) {
    logger.error("insertOrder failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new APIError(500, "Failed to create order.");
  }

  if (!order) {
    throw new APIError(500, "Failed to create order.");
  }

  // The lock did its job; mark it — and any sibling lock this viewer holds on
  // the same extraction — spent so a second order cannot reuse one. The order
  // exists by now, so a failure here is logged, not thrown — except a missing
  // table, which is a deploy bug and must surface.
  if (intake.rate_lock_id) {
    try {
      await consumeQuoteLocksForOrder({
        viewer,
        extractionCacheId: intake.extraction_cache_id,
        lockId: intake.rate_lock_id,
        orderId: order.id,
        actorId: user.id,
        exchangeRate: pricing.exchange_rate,
      });
    } catch (err) {
      if (isSchemaMissingError(err)) throw err;
      logger.error("consumeQuoteLocksForOrder failed", {
        orderId: order.id,
        lockId: intake.rate_lock_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "order_created",
    entityType: "order",
    entityId: order.id,
    metadata: {
      product_url: intake.product_url,
      order_group_id: links.order_group_id ?? null,
      origin_country: intake.origin_country,
      total_ghs: pricing.total_ghs,
      pricing_method: pricing.pricing_method,
      extraction_cache_id: intake.extraction_cache_id,
      rate_lock_id: intake.rate_lock_id,
      review_reasons: reviewReasons,
    },
  });

  // Fire-and-forget: notify the customer their order was received
  if (links.suppress_placed_email) return order as Order;
  (async () => {
    try {
      const supabase = createAdminClient();
      const { data: userData, error } = await supabase.auth.admin.getUserById(user.id);
      if (!error && userData?.user?.email) {
        const template = orderPlacedTemplate({
          productName: order.product_name,
          orderId: order.id,
          totalGhs: pricing.total_ghs,
          needsReview: needsReview,
          paymentUrl: needsReview ? undefined : `${env.app.url}/app/orders/${order.id}`,
        });
        await sendEmail({ to: userData.user.email, subject: template.subject, html: template.html });
      }
    } catch (err) {
      logger.error("order placed email failed", {
        orderId: order.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return order as Order;
}

export async function getOrder(
  client: SupabaseClient,
  user: PlatformUser,
  orderId: string,
): Promise<Order> {
  const order = await getOrderById(client, orderId);

  if (!order) {
    throw new APIError(404, "Order not found");
  }

  if (!canAccessAdmin(user) && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  return order as Order;
}

export async function listUserOrders(
  client: SupabaseClient,
  user: PlatformUser,
): Promise<OrderList> {
  const orders = await getOrdersByUserId(client, user.id);
  return { orders: orders as Order[], count: orders.length };
}

export async function listAllOrders(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; needsReview?: boolean },
): Promise<OrderList> {

  const orders = await getAllOrders(client, filters);
  return { orders: orders as Order[], count: orders.length };
}

/**
 * What an admin may attach to a status change.
 *
 * SNAKE_CASE, matching `updateOrderStatusSchema` and the columns — and that is a
 * BUG FIX, not a style choice. `PATCH /api/admin/orders/[id]` has always spread
 * the parsed body (`tracking_number`, `estimated_delivery_date`) into a parameter
 * typed in camelCase, so `trackingNumber` and `estimatedDeliveryDate` arrived
 * `undefined` on every call: the tracking number and the ETA were silently
 * dropped while the carrier (spelled the same either way) got through. Phase 5's
 * detail screen reads exactly those two columns, so it surfaces the moment the
 * screen exists.
 */
export interface OrderTrackingInput {
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;
  notes?: string;
  /** 050: the delivery WINDOW the customer is shown. */
  eta_from?: string;
  eta_to?: string;
  /**
   * Legacy single date. Still accepted, still stored: the deliveries table and
   * the status email both read it. When only a window is given it is derived
   * below as the window's midpoint.
   */
  estimated_delivery_date?: string;
}

export async function updateOrderStatusAdmin(
  client: SupabaseClient,
  user: PlatformUser,
  orderId: string,
  newStatus: string,
  trackingData?: OrderTrackingInput,
): Promise<Order> {
  if (!canAccessAdmin(user)) {
    throw new APIError(403, "Admin access required");
  }

  const order = await getOrderById(client, orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  // 054: a hold stops the parcel moving without pretending to be a status.
  // Checked BEFORE the transition table, because "this order is on hold" is the
  // useful answer and "cannot go from processing to in_transit" is not. A held
  // order is released by clearing `held_at`, which is a separate admin action —
  // advancing it must never be the thing that quietly lifts the hold.
  if (order.held_at) {
    throw new APIError(
      409,
      `This order is on hold and cannot be moved: ${order.hold_reason ?? "no reason recorded"}`,
    );
  }

  const allowed: readonly string[] = allowedTransitionsFrom(order.status);
  if (!allowed.includes(newStatus)) {
    throw new APIError(
      400,
      `Cannot transition order from '${order.status}' to '${newStatus}'`,
    );
  }

  // The window is the source of truth from 050 on; `estimated_delivery_date`
  // is kept as its midpoint so the deliveries table and the status email keep
  // reading one date without either knowing about the window.
  const eta = resolveEtaWindow(trackingData);

  const updatePayload: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    estimated_delivery_date?: string;
    eta_from?: string;
    eta_to?: string;
    delivered_at?: string;
  } = { status: newStatus };

  if (newStatus === "in_transit" && trackingData) {
    if (trackingData.tracking_number)
      updatePayload.tracking_number = trackingData.tracking_number;
    if (trackingData.carrier) updatePayload.carrier = trackingData.carrier;
    if (eta.from) updatePayload.eta_from = eta.from;
    if (eta.to) updatePayload.eta_to = eta.to;
    if (eta.midpoint) updatePayload.estimated_delivery_date = eta.midpoint;
  }

  if (newStatus === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }

  const supabase = createAdminClient();
  const updated = await updateOrderStatus(supabase, orderId, updatePayload);
  if (!updated) {
    throw new APIError(500, "Failed to update order status");
  }

  // Sync order_deliveries record when entering or completing the shipping pipeline
  if (newStatus === "in_transit" || newStatus === "delivered") {
    const deliveryFields: Parameters<typeof upsertOrderDelivery>[3] = {
      status: newStatus === "in_transit" ? "in_transit" : "delivered",
      ...(trackingData?.carrier && { carrier: trackingData.carrier }),
      ...(trackingData?.tracking_number && {
        tracking_number: trackingData.tracking_number,
      }),
      ...(eta.midpoint && { estimated_delivery_date: eta.midpoint }),
      ...(eta.from && { eta_from: eta.from }),
      ...(eta.to && { eta_to: eta.to }),
      ...(trackingData?.tracking_url && {
        tracking_url: trackingData.tracking_url,
      }),
      ...(trackingData?.notes && { notes: trackingData.notes }),
      ...(newStatus === "delivered" && {
        delivered_at: updatePayload.delivered_at,
      }),
    };
    await upsertOrderDelivery(supabase, orderId, order.user_id, deliveryFields);
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    metadata: { from: order.status, to: newStatus },
  });

  // The customer's half of the same fact (050). `audit_logs` above stays the
  // compliance record — machine-worded, admin-only; this is the sentence the
  // journey's Updates timeline shows. Never throws: see `recordOrderEvent`.
  const narrative = eventForStatus(newStatus);
  if (narrative) {
    await recordOrderEvent({
      order_id: orderId,
      order_group_id: order.order_group_id ?? null,
      kind: narrative.kind,
      title: narrative.title,
      // The carrier and its tracking number are the customer-facing half of an
      // `in_transit` change; nothing is written when the admin left them blank.
      detail:
        newStatus === "in_transit"
          ? ([trackingData?.carrier, trackingData?.tracking_number]
              .filter((part): part is string => !!part?.trim())
              .join(" · ") || null)
          : null,
      created_by: user.id,
    });
  }

  sendOrderStatusEmail(order.user_id, updated, newStatus, {
    trackingNumber: trackingData?.tracking_number,
    carrier: trackingData?.carrier,
    estimatedDeliveryDate: eta.midpoint,
  });

  return updated as Order;
}

/**
 * The window an admin set, and the single date derived from it.
 *
 * Three inputs are possible and all three are honoured:
 *  - a window only → the midpoint becomes `estimated_delivery_date`;
 *  - a single date only → it becomes a one-day window, NOT a fabricated spread;
 *  - both → each is stored as given, because an operator who typed both means both.
 *
 * The midpoint rounds DOWN (`Math.floor`) so an even-length window resolves to
 * the earlier of the two middle days: a customer told "the 18th" for an 18–21
 * window is disappointed by nothing.
 */
function resolveEtaWindow(input: OrderTrackingInput | undefined): {
  from?: string;
  to?: string;
  midpoint?: string;
} {
  const from = input?.eta_from?.trim() || undefined;
  const to = input?.eta_to?.trim() || undefined;
  const single = input?.estimated_delivery_date?.trim() || undefined;

  if (!from && !to) {
    return single ? { from: single, to: single, midpoint: single } : {};
  }

  // A half-open window is a real answer ("from the 18th, we cannot promise the
  // far end"); it is stored as given rather than squared off into a fake range.
  const start = from ?? to;
  const end = to ?? from;
  if (single) return { from, to, midpoint: single };

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { from, to, midpoint: start };
  }

  const midMs = startMs + Math.floor((endMs - startMs) / 2 / DAY_MS) * DAY_MS;
  return { from, to, midpoint: new Date(midMs).toISOString().slice(0, 10) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function cancelOrderByUser(
  user: PlatformUser,
  orderId: string,
): Promise<Order> {
  const supabase = createAdminClient();
  const order = await getOrderById(supabase, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") {
    throw new APIError(400, "Only pending orders can be cancelled");
  }

  // A Paystack transaction may be open for this order right now. Cancelling
  // underneath it would let the charge land on a cancelled order and put the
  // customer in the refund queue; the reconciliation job releases an abandoned
  // payment within the expiry window, after which cancelling is fine.
  if (await hasPendingPayment(supabase, order)) {
    throw new APIError(409, "A payment for this order is still in progress. Wait for it to finish or fail, then try again.");
  }

  const updated = await updateOrderStatus(supabase, orderId, {
    status: "cancelled",
  });
  if (!updated) throw new APIError(500, "Failed to cancel order");

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "order_cancelled_by_user",
    entityType: "order",
    entityId: orderId,
    metadata: { from: "pending", to: "cancelled" },
  });

  // The customer cancelled it themselves, so the timeline says so in their
  // words too — the journey detail screen renders the same log either way.
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id ?? null,
    kind: "cancelled",
    title: "You cancelled this order",
    created_by: user.id,
  });

  sendOrderStatusEmail(user.id, updated, "cancelled");

  return updated as Order;
}

/** Is a Paystack transaction still open for this order, or for the bag it belongs to? */
async function hasPendingPayment(client: SupabaseClient, order: Order): Promise<boolean> {
  const base = client.from("payments").select("id").eq("status", "pending").limit(1);
  const scoped = order.order_group_id
    ? base.eq("order_group_id", order.order_group_id)
    : base.filter("metadata->>order_id", "eq", order.id);
  const { data, error } = await scoped;
  if (error) {
    logger.error("hasPendingPayment failed", { orderId: order.id, message: error.message });
    // Fail closed: refusing a cancel is recoverable, cancelling under a live charge is not.
    return true;
  }
  return (data?.length ?? 0) > 0;
}

export async function getOrderAuditHistory(
  user: PlatformUser,
  orderId: string,
): Promise<AuditLog[]> {
  const supabase = createAdminClient();
  const order = await getOrderById(supabase, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (!canAccessAdmin(user) && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  return getOrderAuditLogs(supabase, orderId);
}
