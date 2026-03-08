"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { Order } from "@/features/orders/types";
import { orderKeys } from "./useOrders";

/** Create an order from extracted product data */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation<Order, Error, Record<string, unknown>>({
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
