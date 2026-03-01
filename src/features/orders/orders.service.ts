import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertOrder,
  getOrderById,
  getOrdersByUserId,
  getAllOrders,
  updateOrderStatus,
} from "@/features/orders/orders.queries";
import { calculatePricing } from "@/features/pricing/pricing.service";
import { logAuditEvent } from "@/features/audit/audit.service";
import { isDomainAllowed } from "@/features/stores/stores.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { PaginatedDataResponse } from "@/types/api";
import type { DbOrder } from "@/types/db";
import { createClient } from "@/lib/supabase/server";
import { Order, OrderList } from "./types";

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
 * Create a new order with server-calculated pricing.
 */
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
    extractionMetadata?: Record<string, unknown> | null;
  },
): Promise<ServiceResult<Order>> {
  // Validate product URL domain against supported stores
  const domainAllowed = await isDomainAllowed(input.productUrl);
  if (!domainAllowed) {
    return {
      success: false,
      error: "Product URL must be from a supported store",
      status: 400,
    };
  }

  // Calculate pricing server-side (never trust client-provided totals)
  const pricingResult = await calculatePricing(
    input.estimatedPriceUsd,
    input.quantity,
    input.originCountry,
  );

  if (!pricingResult.success) {
    return {
      success: false,
      error: pricingResult.error,
      status: pricingResult.status,
    };
  }

  const order = await insertOrder(client, {
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
    needs_review: input.needsReview ?? false,
    review_reasons: input.reviewReasons ?? [],
    extraction_metadata: input.extractionMetadata ?? null,
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
 * List orders for the authenticated user (paginated).
 * Uses the user-scoped client so RLS enforces ownership automatically.
 */
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

  if (error) {
    throw error;
  }

  return {
    data,
    total: count || 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  };
};

/**
 * Get a single order by ID.
 * Pass createClient() for user routes (RLS enforces ownership).
 * Pass createAdminClient() for admin routes (bypasses RLS).
 */
export async function getOrder(
  client: SupabaseClient,
  user: AuthenticatedUser,
  orderId: string,
): Promise<ServiceResult<Order>> {
  const order = await getOrderById(client, orderId);

  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }

  // Extra code-level ownership check for user-scoped calls
  if (user.role !== "admin" && order.user_id !== user.id) {
    return { success: false, error: "Order not found", status: 404 };
  }

  return { success: true, data: toResponse(order) };
}

/**
 * List all orders for the authenticated user.
 */
export async function listUserOrders(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<ServiceResult<OrderList>> {
  const orders = await getOrdersByUserId(client, user.id);

  return {
    success: true,
    data: {
      orders: orders.map(toResponse),
      count: orders.length,
    },
  };
}

/**
 * Admin: list all orders with optional filters.
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function listAllOrders(
  client: SupabaseClient,
  user: AuthenticatedUser,
  filters?: { status?: string; userId?: string; needsReview?: boolean },
): Promise<ServiceResult<OrderList>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const orders = await getAllOrders(client, filters);

  return {
    success: true,
    data: {
      orders: orders.map(toResponse),
      count: orders.length,
    },
  };
}

// Valid admin-driven transitions (paid → processing → completed; pending → cancelled)
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["completed"],
};

/**
 * Admin: update an order's status following the state machine.
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function updateOrderStatusAdmin(
  client: SupabaseClient,
  user: AuthenticatedUser,
  orderId: string,
  newStatus: string,
): Promise<ServiceResult<Order>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const order = await getOrderById(client, orderId);
  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition order from '${order.status}' to '${newStatus}'`,
      status: 400,
    };
  }

  const updated = await updateOrderStatus(client, orderId, newStatus);
  if (!updated) {
    return {
      success: false,
      error: "Failed to update order status",
      status: 500,
    };
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    metadata: { from: order.status, to: newStatus },
  });

  return { success: true, data: toResponse(updated) };
}
