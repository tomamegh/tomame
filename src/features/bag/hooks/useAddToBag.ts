"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { AddToBagInput } from "../schema";
import type { AddToBagResult, BagView } from "../types";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";

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
    onSuccess: (result, input) => {
      queryClient.invalidateQueries({ queryKey: bagKeys.all });
      trackAddToBag(result, input.quantity);
    },
  });
}

/**
 * Meta Pixel `AddToCart`. The line's own server price when it has one; a link
 * still being read has none yet and is sent without a value.
 */
export function trackAddToBag(result: AddToBagResult, quantity: number): void {
  const { line } = result;
  const total = line.pricing?.total_ghs;
  // The line total covers every unit on the line; a repeat add only raised it.
  const value =
    typeof total === "number" && Number.isFinite(total) && line.quantity > 0
      ? Math.round((total / line.quantity) * quantity * 100) / 100
      : null;
  trackMetaEvent("AddToCart", {
    content_type: "product",
    content_ids: [line.extraction_cache_id ?? line.id],
    num_items: quantity,
    ...(value != null ? { value, currency: "GHS" as const } : {}),
  });
}

export async function fetchBag(): Promise<BagView> {
  const res = await apiFetch<ApiSuccessResponse<BagView>>("/api/cart");
  return res.data;
}
