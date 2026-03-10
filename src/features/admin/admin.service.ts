import type { SupabaseClient } from "@supabase/supabase-js";
import { APIError } from "@/lib/auth/api-helpers";
import type { DashboardData } from "./types";
import { logger } from "@/lib/logger";

export async function getDashboardData(
  client: SupabaseClient,
): Promise<DashboardData> {
  try {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [
      totalOrdersRes,
      reviewOrdersRes,
      revenueOrdersRes,
      activeUsersRes,
      chartOrdersRes,
      latestOrdersRes,
      latestDeliveriesRes,
      latestTransactionsRes,
    ] = await Promise.all([
      client.from("orders").select("*", { count: "exact", head: true }),

      client
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("needs_review", true)
        .not("status", "in", "(cancelled,completed)"),

      client
        .from("orders")
        .select("pricing")
        .in("status", ["paid", "processing", "in_transit", "delivered", "completed"]),

      client
        .from("orders")
        .select("user_id")
        .gte("created_at", thirtyDaysAgo),

      client
        .from("orders")
        .select("created_at, user_id, pricing")
        .gte("created_at", thirtyDaysAgo)
        .neq("status", "cancelled"),

      client
        .from("orders")
        .select("id, product_name, status, origin_country, pricing, quantity, needs_review, created_at")
        .order("created_at", { ascending: false })
        .limit(10),

      client
        .from("orders")
        .select("id, product_name, status, carrier, tracking_number, estimated_delivery_date, created_at")
        .in("status", ["processing", "in_transit", "delivered", "completed"])
        .order("created_at", { ascending: false })
        .limit(6),

      client
        .from("payments")
        .select("id, reference, amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const totalOrders = totalOrdersRes.count ?? 0;
    const ordersNeedingReview = reviewOrdersRes.count ?? 0;
    const totalRevenueGhs = (revenueOrdersRes.data ?? []).reduce(
      (sum, o) => sum + ((o.pricing as { total_ghs?: number })?.total_ghs ?? 0),
      0,
    );
    const activeUsers = new Set(
      (activeUsersRes.data ?? []).map((o) => o.user_id as string),
    ).size;

    const chartMap = new Map<
      string,
      { orders: number; revenueGhs: number; userIds: Set<string> }
    >();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0]!;
      chartMap.set(key, { orders: 0, revenueGhs: 0, userIds: new Set() });
    }

    for (const order of chartOrdersRes.data ?? []) {
      const key = (order.created_at as string).split("T")[0]!;
      const entry = chartMap.get(key);
      if (entry) {
        entry.orders++;
        entry.revenueGhs +=
          (order.pricing as { total_ghs?: number })?.total_ghs ?? 0;
        entry.userIds.add(order.user_id as string);
      }
    }

    const chartData = Array.from(chartMap.entries()).map(([date, e]) => ({
      date,
      orders: e.orders,
      revenueGhs: e.revenueGhs,
      users: e.userIds.size,
    }));

    const latestOrders = (latestOrdersRes.data ?? []).map((o) => ({
      id: o.id as string,
      productName: o.product_name as string,
      status: o.status as string,
      originCountry: o.origin_country as string,
      totalGhs: (o.pricing as { total_ghs?: number })?.total_ghs ?? null,
      quantity: o.quantity as number,
      needsReview: o.needs_review as boolean,
      createdAt: o.created_at as string,
    }));

    const latestDeliveries = (latestDeliveriesRes.data ?? []).map((o) => ({
      id: o.id as string,
      productName: o.product_name as string,
      status: o.status as string,
      carrier: (o.carrier as string | null) ?? null,
      trackingNumber: (o.tracking_number as string | null) ?? null,
      estimatedDeliveryDate: (o.estimated_delivery_date as string | null) ?? null,
      createdAt: o.created_at as string,
    }));

    const latestTransactions = (latestTransactionsRes.data ?? []).map((p) => ({
      id: p.id as string,
      reference: p.reference as string,
      amountGhs: (p.amount as number) / 100,
      status: p.status as string,
      createdAt: p.created_at as string,
    }));

    return {
      stats: { totalOrders, ordersNeedingReview, totalRevenueGhs, activeUsers },
      chartData,
      latestOrders,
      latestDeliveries,
      latestTransactions,
    };
  } catch (err) {
    if (err instanceof APIError) throw err;
    logger.error("getDashboardData failed", { error: err });
    throw new APIError(500, "Failed to load dashboard data");
  }
}
