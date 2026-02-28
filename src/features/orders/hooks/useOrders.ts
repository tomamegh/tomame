"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { CreateOrderInput, Order, OrderList } from "../types";
import { PaginatedDataResponse } from "@/types/api";

// ── Query keys ───────────────────────────────────────────────

export const orderKeys = {
  all: ["orders"] as const,
  user: () => [...orderKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; needsReview?: boolean }) =>
    [...orderKeys.all, "admin", filters ?? {}] as const,
  detail: (id: string) => [...orderKeys.all, id] as const,
};

// ── User hooks ───────────────────────────────────────────────

/** List the current user's orders */
export function useUserOrders() {
  return useQuery<PaginatedDataResponse<Order>>({
    queryKey: orderKeys.user(),
    queryFn: () => apiFetch("/api/orders"),
  });
}

/** Get a single order by ID (user sees their own; admin sees any) */
export function useOrder(id: string) {
  return useQuery<Order>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: !!id,
  });
}

/** Submit a new product order */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: (data) =>
      apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.user() });
    },
  });
}

// ── Admin hooks ──────────────────────────────────────────────

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

