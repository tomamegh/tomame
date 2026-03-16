import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { resolvePlatform } from "@/features/extraction/scrapers";
import { sendEmail } from "@/lib/email/transport";
import {
  orderPaidTemplate,
  orderProcessingTemplate,
  orderShippedTemplate,
  orderDeliveredTemplate,
  orderCancelledTemplate,
} from "@/lib/email/templates/order-status";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/features/auth/types";
import type { PaginatedDataResponse } from "@/types/api";
import type { DbOrder, DbAuditLog } from "@/types/db";
import { createClient } from "@/lib/supabase/server";
import { Order, OrderList, type OrderExtractionMetadata } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getOrderById(
  client: SupabaseClient,
  orderId: string
): Promise<DbOrder | null> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error) return null;
  return data as DbOrder;
}

async function updateOrderStatus(
  client: SupabaseClient,
  orderId: string,
  updates: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    estimated_delivery_date?: string;
    delivered_at?: string;
  },
): Promise<DbOrder | null> {
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
  return data as DbOrder;
}

export async function linkOrderToPayment(
  client: SupabaseClient,
  orderId: string,
  paymentId: string
): Promise<DbOrder | null> {
  const { data, error } = await client
    .from("orders")
    .update({ payment_id: paymentId, status: "paid" })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    logger.error("linkOrderToPayment failed", {
      orderId,
      paymentId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as DbOrder;
}

async function getOrdersByUserId(
  client: SupabaseClient,
  userId: string
): Promise<DbOrder[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

    console.log(data)

  if (error) {
    logger.error("getOrdersByUserId failed", { userId, error: error.message });
    return [];
  }
  return (data ?? []) as DbOrder[];
}

async function getAllOrders(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; needsReview?: boolean }
): Promise<DbOrder[]> {
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
    return [];
  }
  return (data ?? []) as DbOrder[];
}

async function getOrderAuditLogs(
  client: SupabaseClient,
  orderId: string
): Promise<DbAuditLog[]> {
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
  return (data ?? []) as DbAuditLog[];
}

async function sendOrderStatusEmail(
  userId: string,
  order: DbOrder,
  newStatus: string,
  trackingData?: {
    trackingNumber?: string;
    carrier?: string;
    estimatedDeliveryDate?: string;
  },
): Promise<void> {
  try {
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

export async function createOrder(
  client: SupabaseClient,
  user: AuthenticatedUser,
  input: {
    productUrl: string;
    productName: string;
    productImageUrl?: string;
    estimatedPriceUsd: number;
    quantity: number;
    originCountry: "USA" | "UK" | "CHINA";
    specialInstructions?: string;
    needsReview?: boolean;
    reviewReasons?: string[];
    extractionMetadata?: OrderExtractionMetadata | null;
    extractionData?: Record<string, unknown> | null;
  },
): Promise<Order> {
  const platform = resolvePlatform(input.productUrl);
  if (!platform) {
    throw new APIError(400, "We currently do not support this store. Please try again");
  }

  const pricing = await calculatePricing(
    input.estimatedPriceUsd,
    input.quantity,
    input.originCountry,
  );

  const orderToCreate = {
    user_id: user.id,
    product_url: input.productUrl,
    product_name: input.productName,
    product_image_url: input.productImageUrl ?? null,
    estimated_price_usd: input.estimatedPriceUsd,
    quantity: input.quantity,
    origin_country: input.originCountry,
    special_instructions: input.specialInstructions ?? null,
    pricing,
    status: "pending",
    needs_review: input.needsReview ?? false,
    review_reasons: input.reviewReasons ?? [],
    extraction_metadata: (input.extractionMetadata ?? null) as Record<
      string,
      unknown
    > | null,
    ...(input.extractionData != null
      ? { extraction_data: input.extractionData }
      : {}),
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

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "order_created",
    entityType: "order",
    entityId: order.id,
    metadata: {
      productUrl: input.productUrl,
      originCountry: input.originCountry,
      totalGhs: pricing.total_ghs,
    },
  });

  return order as Order;
}

export const getUserOrders = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedDataResponse<Order>> => {
  const supabase = await createClient();

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    data: (data ?? []) as Order[],
    total: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
};

export async function getOrder(
  client: SupabaseClient,
  user: AuthenticatedUser,
  orderId: string,
): Promise<Order> {
  const order = await getOrderById(client, orderId);

  if (!order) {
    throw new APIError(404, "Order not found");
  }

  if (user.role !== "admin" && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  return order as Order;
}

export async function listUserOrders(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<OrderList> {
  const orders = await getOrdersByUserId(client, user.id);
  return { orders: orders as Order[], count: orders.length };
}

export async function listAllOrders(
  client: SupabaseClient,
  user: AuthenticatedUser,
  filters?: { status?: string; userId?: string; needsReview?: boolean },
): Promise<OrderList> {
  if (user.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const orders = await getAllOrders(client, filters);
  return { orders: orders as Order[], count: orders.length };
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed"],
};

export async function updateOrderStatusAdmin(
  client: SupabaseClient,
  user: AuthenticatedUser,
  orderId: string,
  newStatus: string,
  trackingData?: {
    trackingNumber?: string;
    carrier?: string;
    estimatedDeliveryDate?: string;
  },
): Promise<Order> {
  if (user.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const order = await getOrderById(client, orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new APIError(
      400,
      `Cannot transition order from '${order.status}' to '${newStatus}'`,
    );
  }

  const updatePayload: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    estimated_delivery_date?: string;
    delivered_at?: string;
  } = { status: newStatus };

  if (newStatus === "in_transit" && trackingData) {
    if (trackingData.trackingNumber) updatePayload.tracking_number = trackingData.trackingNumber;
    if (trackingData.carrier) updatePayload.carrier = trackingData.carrier;
    if (trackingData.estimatedDeliveryDate) updatePayload.estimated_delivery_date = trackingData.estimatedDeliveryDate;
  }

  if (newStatus === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }

  const supabase = createAdminClient();
  const updated = await updateOrderStatus(supabase, orderId, updatePayload);
  if (!updated) {
    throw new APIError(500, "Failed to update order status");
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    metadata: { from: order.status, to: newStatus },
  });

  sendOrderStatusEmail(order.user_id, updated, newStatus, trackingData);

  return updated as Order;
}

export async function cancelOrderByUser(
  user: AuthenticatedUser,
  orderId: string,
): Promise<Order> {
  const supabase = createAdminClient();
  const order = await getOrderById(supabase, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") {
    throw new APIError(400, "Only pending orders can be cancelled");
  }

  const updated = await updateOrderStatus(supabase, orderId, { status: "cancelled" });
  if (!updated) throw new APIError(500, "Failed to cancel order");

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "order_cancelled_by_user",
    entityType: "order",
    entityId: orderId,
    metadata: { from: "pending", to: "cancelled" },
  });

  sendOrderStatusEmail(user.id, updated, "cancelled");

  return updated as Order;
}

export async function getOrderAuditHistory(
  user: AuthenticatedUser,
  orderId: string,
): Promise<DbAuditLog[]> {
  const supabase = createAdminClient();
  const order = await getOrderById(supabase, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (user.role !== "admin" && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  return getOrderAuditLogs(supabase, orderId);
}
