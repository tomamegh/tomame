"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { AddToBagInput } from "../schema";
import type { AddToBagResult, BagView } from "../types";

export const bagKeys = {
  all: ["bag"] as const,
};

/** Add a stored quote to the viewer's bag. Identity + quantity only; the server prices. */
export function useAddToBag() {
  const queryClient = useQueryClient();
  return useMutation<AddToBagResult, Error, AddToBagInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<AddToBagResult>>("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bagKeys.all });
    },
  });
}

export async function fetchBag(): Promise<BagView> {
  const res = await apiFetch<ApiSuccessResponse<BagView>>("/api/cart");
  return res.data;
}
