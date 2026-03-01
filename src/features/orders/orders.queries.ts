import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbOrder, DbAuditLog, OrderPricingBreakdown } from "@/types/db";
import { logger } from "@/lib/logger";

interface OrderInsert {
  user_id: string;
  product_url: string;
  product_name: string;
  product_image_url?: string | null;
  estimated_price_usd: number;
  quantity: number;
  origin_country: "USA" | "UK" | "CHINA";
  special_instructions?: string | null;
  pricing: OrderPricingBreakdown;
  status: string;
  needs_review?: boolean;
  review_reasons?: string[];
  extraction_metadata?: Record<string, unknown> | null;
}

export async function insertOrder(
  client: SupabaseClient,
  order: OrderInsert
): Promise<DbOrder | null> {
  const { data, error } = await client
    .from("orders")
    .insert(order)
    .select()
    .single();

  if (error) {
    logger.error("insertOrder failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }
  return data as DbOrder;
}

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

export async function updateOrderStatus(
  client: SupabaseClient,
  orderId: string,
  updates: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    estimated_delivery_date?: string;
    delivered_at?: string;
  }
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

export async function getOrdersByUserId(
  client: SupabaseClient,
  userId: string
): Promise<DbOrder[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getOrdersByUserId failed", {
      userId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as DbOrder[];
}

export async function getAllOrders(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; needsReview?: boolean }
): Promise<DbOrder[]> {
  let query = client
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.userId) {
    query = query.eq("user_id", filters.userId);
  }
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

export async function updateOrderReview(
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
): Promise<DbOrder | null> {
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
  return data as DbOrder;
}

export async function getOrderAuditLogs(
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
    logger.error("getOrderAuditLogs failed", {
      orderId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as DbAuditLog[];
}
