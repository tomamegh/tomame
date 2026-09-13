"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateAddressInput } from "../schema";
import type { DeliveryAddress } from "../types";

export const addressKeys = {
  all: ["addresses"] as const,
};

/**
 * The viewer's saved addresses, seeded from the server render.
 *
 * `enabled` is off for signed-out viewers: `/api/addresses` answers 401 there
 * and a retrying query would just throw under an empty list.
 */
export function useAddresses(initialData: DeliveryAddress[], enabled = true) {
  return useQuery<DeliveryAddress[]>({
    queryKey: addressKeys.all,
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<DeliveryAddress[]>>("/api/addresses");
      return res.data;
    },
    initialData,
    enabled,
    staleTime: 0,
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation<DeliveryAddress, Error, CreateAddressInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<DeliveryAddress>>("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressKeys.all });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiFetch<ApiSuccessResponse<{ deleted: true }>>(`/api/addresses/${id}`, { method: "DELETE" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: addressKeys.all }),
  });
}
