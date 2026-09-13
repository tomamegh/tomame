"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateAddressInput, UpdateAddressInput } from "../schema";
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

/**
 * Edits one saved address — the account screen's "Make default".
 *
 * The default flag moves atomically on the server (`updateAddress` clears the
 * old default in the same call), so this invalidates the whole list rather than
 * patching one row in the cache: two rows change, and only the server knows
 * which one was demoted.
 */
export function useUpdateAddress() {
  const queryClient = useQueryClient();
  return useMutation<DeliveryAddress, Error, { id: string; input: UpdateAddressInput }>({
    mutationFn: async ({ id, input }) => {
      const res = await apiFetch<ApiSuccessResponse<DeliveryAddress>>(`/api/addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: addressKeys.all }),
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
