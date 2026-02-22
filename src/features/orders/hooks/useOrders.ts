"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderRequest, OrderResponse, OrderListResponse } from "@/types/api";

// ── Query keys ───────────────────────────────────────────────

export const orderKeys = {
  all: ["orders"] as const,
  user: () => [...orderKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string }) =>
    [...orderKeys.all, "admin", filters ?? {}] as const,
  detail: (id: string) => [...orderKeys.all, id] as const,
};

// ── Helpers ──────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ── User hooks ───────────────────────────────────────────────

/** List the current user's orders */
export function useUserOrders() {
  return useQuery<OrderListResponse>({
    queryKey: orderKeys.user(),
    queryFn: () => apiFetch("/api/orders"),
  });
}

/** Get a single order by ID (user sees their own; admin sees any) */
export function useOrder(id: string) {
  return useQuery<OrderResponse>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: !!id,
  });
}

/** Submit a new product order */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, Error, CreateOrderRequest>({
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
export function useAdminOrders(filters?: { status?: string; userId?: string }) {
  return useQuery<OrderListResponse>({
    queryKey: orderKeys.admin(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.userId) params.set("userId", filters.userId);
      const qs = params.toString();
      return apiFetch(`/api/admin/orders${qs ? `?${qs}` : ""}`);
    },
  });
}

/** Admin: get any order by ID */
export function useAdminOrder(id: string) {
  return useQuery<OrderResponse>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiFetch(`/api/admin/orders/${id}`),
    enabled: !!id,
  });
}

/** Admin: update an order's status */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, Error, { id: string; status: string }>({
    mutationFn: ({ id, status }) =>
      apiFetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.setQueryData(orderKeys.detail(updated.id), updated);
    },
  });
}
