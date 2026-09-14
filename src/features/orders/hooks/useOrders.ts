"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { Order, OrderList } from "../types";
import type { ApiSuccessResponse } from "@/types/api";
import type { CustomerOrderHistoryEntry } from "@/features/orders/services/orders.service";

// ── Query keys ───────────────────────────────────────────────

export const orderKeys = {
  all: ["orders"] as const,
  user: () => [...orderKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; needsReview?: boolean }) =>
    [...orderKeys.all, "admin", filters ?? {}] as const,
  detail: (id: string) => [...orderKeys.all, id] as const,
  adminDetail: (id: string) => [...orderKeys.all, "admin", id] as const,
  history: (id: string) => [...orderKeys.all, id, "history"] as const,
};

// ── User hooks ───────────────────────────────────────────────

/**
 * List the current user's orders.
 *
 * `GET /api/orders` answers `{ orders, count }` now, not a bare array — the
 * Journeys screen needs the count for its filter pills. `select` keeps the
 * existing `Order[]` contract for every caller that only wanted the rows.
 */
export function useUserOrders() {
  return useQuery<ApiSuccessResponse<OrderList>, Error, Order[]>({
    queryKey: orderKeys.user(),
    queryFn: () => apiFetch<ApiSuccessResponse<OrderList>>("/api/orders"),
    select: (res) => res.data.orders,
  });
}

/** Get a single order by ID (user sees their own; admin sees any) */
export function useOrder(id: string) {
  return useQuery<ApiSuccessResponse<Order>, Error, Order>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiFetch<ApiSuccessResponse<Order>>(`/api/orders/${id}`),
    select: (res) => res.data,
    enabled: !!id,
    retry: 1
  });
}

// ── Admin hooks ──────────────────────────────────────────────

/** Admin: get a single order by ID (admin endpoint) */
export function useAdminOrderDetail(id: string) {
  return useQuery<ApiSuccessResponse<Order>, Error, Order>({
    queryKey: orderKeys.adminDetail(id),
    queryFn: () => apiFetch<ApiSuccessResponse<Order>>(`/api/admin/orders/${id}`),
    select: (res) => res.data,
    enabled: !!id,
  });
}

/** Admin: list all orders with optional filters */
export function useAdminOrders(filters?: {
  status?: string;
  userId?: string;
  needsReview?: boolean;
}) {
  return useQuery<OrderList>({
    queryKey: orderKeys.admin(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.userId) params.set("userId", filters.userId);
      if (filters?.needsReview !== undefined)
        params.set("needsReview", String(filters.needsReview));
      const qs = params.toString();
      return apiFetch(`/api/admin/orders${qs ? `?${qs}` : ""}`);
    },
  });
}

/** Admin: get any order by ID */
export function useAdminOrder(id: string) {
  return useQuery<OrderList>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiFetch(`/api/admin/orders/${id}`),
    enabled: !!id,
  });
}

/** Admin: review a flagged order (approve/reject/set_price) */
export function useReviewOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    Order,
    Error,
    {
      id: string;
      action: "approve" | "reject" | "set_price";
      updates?: {
        productName?: string;
        estimatedPriceUsd?: number;
        productImageUrl?: string | null;
        originCountry?: "USA" | "UK" | "CHINA";
      };
      reason?: string;
      admin_total_ghs?: number;
      admin_pricing_note?: string;
    }
  >({
    mutationFn: ({ id, ...body }) =>
      apiFetch(`/api/admin/orders/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/** Admin: update order status */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, { id: string; status: string }>({
    mutationFn: async ({ id, status }) => {
      const res = await apiFetch<ApiSuccessResponse<Order>>(
        `/api/admin/orders/${id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/** User: cancel a pending order */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, string>({
    mutationFn: async (orderId) => {
      const res = await apiFetch<ApiSuccessResponse<Order>>(
        `/api/orders/${orderId}/cancel`,
        { method: "POST" },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/**
 * Get an order's customer-safe history (used for the status timeline).
 * The server strips this to a whitelist per action — see
 * `CustomerOrderHistoryEntry` in `orders.service.ts`.
 */
export function useOrderHistory(orderId: string) {
  return useQuery<ApiSuccessResponse<CustomerOrderHistoryEntry[]>, Error, CustomerOrderHistoryEntry[]>({
    queryKey: orderKeys.history(orderId),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<CustomerOrderHistoryEntry[]>>(`/api/orders/${orderId}/history`),
    select: (res) => res.data,
    enabled: !!orderId,
  });
}

