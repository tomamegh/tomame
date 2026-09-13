"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { UpdateBagLineInput } from "../schema";
import type { BagLine, BagView } from "../types";
import { bagKeys, fetchBag } from "./useAddToBag";

/** The bag, seeded from the server render and refetched after every mutation. */
export function useBag(initialData: BagView) {
  return useQuery<BagView>({
    queryKey: bagKeys.all,
    queryFn: fetchBag,
    initialData,
    staleTime: 0,
  });
}

export function useUpdateBagLine() {
  const queryClient = useQueryClient();
  return useMutation<BagLine, Error, { id: string } & UpdateBagLineInput>({
    mutationFn: async ({ id, ...input }) => {
      const res = await apiFetch<ApiSuccessResponse<BagLine>>(`/api/cart/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}

export function useRemoveBagLine() {
  const queryClient = useQueryClient();
  return useMutation<{ item_count: number }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiFetch<ApiSuccessResponse<{ item_count: number }>>(`/api/cart/items/${id}`, { method: "DELETE" });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}
