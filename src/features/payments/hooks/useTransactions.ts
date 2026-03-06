"use client";

import { useQuery } from "@tanstack/react-query";
import type { TransactionListResponse } from "@/features/payments/payments.service";

// ── Query keys ───────────────────────────────────────────────

export const transactionKeys = {
  all: ["transactions"] as const,
  user: () => [...transactionKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string }) =>
    [...transactionKeys.all, "admin", filters ?? {}] as const,
};

// ── Helper ───────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ── User hooks ───────────────────────────────────────────────

/** List payment transactions for the current user */
export function useTransactions() {
  return useQuery<TransactionListResponse>({
    queryKey: transactionKeys.user(),
    queryFn: () => apiFetch("/api/transactions"),
  });
}

// ── Admin hooks ──────────────────────────────────────────────

/** Admin: list all transactions with optional filters */
export function useAdminTransactions(filters?: { status?: string; userId?: string }) {
  return useQuery<TransactionListResponse>({
    queryKey: transactionKeys.admin(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.userId) params.set("userId", filters.userId);
      const qs = params.toString();
      return apiFetch(`/api/admin/transactions${qs ? `?${qs}` : ""}`);
    },
  });
}
