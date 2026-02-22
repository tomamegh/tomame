import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbOrder, OrderPricingBreakdown } from "@/types/db";
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
  status: string
): Promise<DbOrder | null> {
  const { data, error } = await client
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    logger.error("updateOrderStatus failed", {
      orderId,
      status,
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
  filters?: { status?: string; userId?: string }
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

  const { data, error } = await query;

  if (error) {
    logger.error("getAllOrders failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbOrder[];
}
