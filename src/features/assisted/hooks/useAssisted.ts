"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { bagKeys } from "@/features/bag/hooks/useAddToBag";
import { pasteKeys } from "@/features/extraction/hooks/usePastes";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateAssistedRequestInput } from "../schema";
import type { AssistedRequest } from "../types";

/**
 * "Have a buyer sort it out." The server owns the link when a paste is named, so
 * the body carries only what the customer typed.
 *
 * On settle, the paste list and the bag are re-read: both carry the link's
 * assisted state, and the row that offered "Describe it instead" must show "A
 * buyer is on it" the moment the request exists — not after the next poll.
 */
export function useCreateAssistedRequest() {
  const queryClient = useQueryClient();
  return useMutation<AssistedRequest, Error, CreateAssistedRequestInput>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<AssistedRequest>>("/api/assisted-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pasteKeys.all });
      queryClient.invalidateQueries({ queryKey: bagKeys.all });
    },
  });
}
