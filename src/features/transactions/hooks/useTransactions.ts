"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { TransactionResponse } from "../services/transactions.service";

export const transactionKeys = {
  all: ["transactions"] as const,
  admin: () => [...transactionKeys.all, "admin"] as const,
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
