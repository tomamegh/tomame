"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { Order, OrderList } from "../types";
import type { ApiSuccessResponse } from "@/types/api";
import type { DbAuditLog } from "@/types/db";
import { CreateOrderSchemaType } from "../schema";

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

/** List the current user's orders */
export function useUserOrders() {
  return useQuery<ApiSuccessResponse<Order[]>, Error, Order[]>({
    queryKey: orderKeys.user(),
    queryFn: () => apiFetch<ApiSuccessResponse<Order[]>>("/api/orders"),
    select: (res) => res.data,
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

/** Submit a new product order */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, CreateOrderSchemaType>({
    mutationFn: async (data) => {
      const res = await apiFetch<ApiSuccessResponse<Order>>("/api/orders/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.user() });
    },
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

/** Admin: review a flagged order (approve/reject) */
export function useReviewOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    Order,
    Error,
    {
      id: string;
      action: "approve" | "reject";
      updates?: {
        productName?: string;
        estimatedPriceUsd?: number;
        productImageUrl?: string | null;
        originCountry?: "USA" | "UK" | "CHINA";
      };
      reason?: string;
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

/** Get audit history for an order (used for timeline) */
export function useOrderHistory(orderId: string) {
  return useQuery<ApiSuccessResponse<DbAuditLog[]>, Error, DbAuditLog[]>({
    queryKey: orderKeys.history(orderId),
    queryFn: () => apiFetch<ApiSuccessResponse<DbAuditLog[]>>(`/api/orders/${orderId}/history`),
    select: (res) => res.data,
    enabled: !!orderId,
  });
}

