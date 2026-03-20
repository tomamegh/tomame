"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { TransactionResponse, SyncResult } from "../services/transactions.service";
import type { TransactionDetail } from "../types";

export const transactionKeys = {
  all: ["transactions"] as const,
  admin: () => [...transactionKeys.all, "admin"] as const,
  detail: (id: string) => [...transactionKeys.all, "admin", id] as const,
};

export function useAdminTransactions() {
  return useQuery<ApiSuccessResponse<TransactionResponse>, Error, TransactionResponse>({
    queryKey: transactionKeys.admin(),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<TransactionResponse>>("/api/admin/transactions"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

export function useAdminTransaction(id: string) {
  return useQuery<ApiSuccessResponse<TransactionDetail>, Error, TransactionDetail>({
    queryKey: transactionKeys.detail(id),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<TransactionDetail>>(`/api/admin/transactions/${id}`),
    select: (res) => res.data,
    enabled: !!id,
  });
}

export function useSyncTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation<SyncResult, Error>({
    mutationFn: () =>
      apiFetch<ApiSuccessResponse<SyncResult>>(`/api/admin/transactions/${id}/sync`, {
        method: "POST",
      }).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: transactionKeys.admin() });
    },
  });
}
