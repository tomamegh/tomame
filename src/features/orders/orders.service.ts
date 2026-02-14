import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  insertOrder,
  getOrderById,
  getOrdersByUserId,
} from "@/features/orders/orders.queries";
import { calculatePricing } from "@/features/pricing/pricing.service";
import { logAuditEvent } from "@/features/audit/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { OrderResponse, OrderListResponse } from "@/types/api";
import type { DbOrder } from "@/types/db";

/** Map a DB order row to the API response shape */
function toResponse(order: DbOrder): OrderResponse {
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
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

/**
 * Create a new order with server-calculated pricing.
 */
export async function createOrder(
  user: AuthenticatedUser,
  input: {
    productUrl: string;
    productName: string;
    productImageUrl?: string;
    estimatedPriceUsd: number;
    quantity: number;
    originCountry: "USA" | "UK" | "CHINA";
    specialInstructions?: string;
  }
): Promise<ServiceResult<OrderResponse>> {
  // Calculate pricing server-side (never trust client-provided totals)
  const pricingResult = await calculatePricing(
    input.estimatedPriceUsd,
    input.quantity,
    input.originCountry
  );

  if (!pricingResult.success) {
    return {
      success: false,
      error: pricingResult.error,
      status: pricingResult.status,
    };
  }

  const order = await insertOrder(supabaseAdmin, {
    user_id: user.id,
    product_url: input.productUrl,
    product_name: input.productName,
    product_image_url: input.productImageUrl ?? null,
    estimated_price_usd: input.estimatedPriceUsd,
    quantity: input.quantity,
    origin_country: input.originCountry,
    special_instructions: input.specialInstructions ?? null,
    pricing: pricingResult.data,
    status: "pending",
  });

  if (!order) {
    return { success: false, error: "Failed to create order", status: 500 };
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
      totalGhs: pricingResult.data.total_ghs,
    },
  });

  return { success: true, data: toResponse(order) };
}

/**
 * Get a single order by ID.
 * Users can only see their own orders; admins can see any order.
 */
export async function getOrder(
  user: AuthenticatedUser,
  orderId: string
): Promise<ServiceResult<OrderResponse>> {
  const order = await getOrderById(supabaseAdmin, orderId);

  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }

  // Enforce ownership: users can only see their own orders
  if (user.role !== "admin" && order.user_id !== user.id) {
    return { success: false, error: "Order not found", status: 404 };
  }

  return { success: true, data: toResponse(order) };
}

/**
 * List all orders for the authenticated user.
 */
export async function listUserOrders(
  user: AuthenticatedUser
): Promise<ServiceResult<OrderListResponse>> {
  const orders = await getOrdersByUserId(supabaseAdmin, user.id);

  return {
    success: true,
    data: {
      orders: orders.map(toResponse),
      count: orders.length,
    },
  };
}
