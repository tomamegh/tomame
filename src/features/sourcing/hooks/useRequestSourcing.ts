"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { bagKeys } from "@/features/bag/hooks/useAddToBag";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateSourcingRequestInput } from "../schema";

export interface SourcingRequestResult {
  watch_id: string;
  cart_item_id: string;
  item_count: number;
  status: "requested" | "available" | "unavailable";
}

/**
 * "We cannot price this one — ask a buyer" (065).
 *
 * Identity and intent only, exactly like `useAddToBag`: the server re-reads its
 * own snapshot and decides for itself whether the item really needs a person.
 * The two optional fields are the customer's guesses travelling as a note for
 * the buyer, never as a price the bag would charge against.
 *
 * The bag cache is invalidated on success because this adds a line — the badge
 * and the bag screen both have to catch up.
 */
export function useRequestSourcing() {
  const queryClient = useQueryClient();
  return useMutation<SourcingRequestResult, Error, CreateSourcingRequestInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<SourcingRequestResult>>("/api/sourcing-requests", {
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
