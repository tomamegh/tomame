"use client";

/**
 * Product hooks — a product-focused view of order requests.
 * Each "product" is an item a user has asked Tomame to source.
 * These hooks wrap the orders API with product-centric naming.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {CreateOrderRequest,Order, OrderList} from "../types"

// ── Query keys ───────────────────────────────────────────────

export const productKeys = {
  all: ["products"] as const,
  user: () => [...productKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; needsReview?: boolean }) =>
    [...productKeys.all, "admin", filters ?? {}] as const,
  detail: (id: string) => [...productKeys.all, id] as const,
};

// ── Helper ───────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ── User hooks ───────────────────────────────────────────────

/** List products (order requests) submitted by the current user */
export function useMyProducts() {
  return useQuery<OrderList>({
    queryKey: productKeys.user(),
    queryFn: () => apiFetch("/api/orders"),
  });
}

/** Get a single product request by order ID */
export function useProduct(id: string) {
  return useQuery<OrderList>({
    queryKey: productKeys.detail(id),
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: !!id,
  });
}

/** Submit a new product purchase request */
export function useRequestProduct() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, CreateOrderRequest>({
    mutationFn: (data) =>
      apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.user() });
    },
  });
}

// ── Admin hooks ──────────────────────────────────────────────

/** Admin: list all product requests with optional filters */
export function useAdminProducts(filters?: {
  status?: string;
  userId?: string;
  needsReview?: boolean;
}) {
  return useQuery<OrderList>({
    queryKey: productKeys.admin(filters),
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

/** Admin: get any product request by order ID */
export function useAdminProduct(id: string) {
  return useQuery<Order>({
    queryKey: productKeys.detail(id),
    queryFn: () => apiFetch(`/api/admin/orders/${id}`),
    enabled: !!id,
  });
}

/** Admin: update status of a product request */
export function useUpdateProductStatus() {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, { id: string; status: string }>({
    mutationFn: ({ id, status }) =>
      apiFetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.setQueryData(productKeys.detail(updated.id), updated);
    },
  });
}
