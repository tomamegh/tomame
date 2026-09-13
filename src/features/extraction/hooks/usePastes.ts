"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bagKeys } from "@/features/bag/hooks/useAddToBag";
import type { AddToBagResult } from "@/features/bag/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { PasteStatus } from "../services/paste-status";

export const pasteKeys = { all: ["pastes"] as const };

/**
 * How often the screen asks again while a link is still being read.
 *
 * Two seconds, matching the bag: a paste usually lands in five to twenty, so
 * this is a handful of requests per link rather than a live feed. Polling stops
 * the moment nothing is reading — an idle screen must not sit there asking.
 */
export const PASTE_POLL_MS = 2_000;

export function usePastes(initialData: PasteStatus[]) {
  return useQuery<PasteStatus[]>({
    queryKey: pasteKeys.all,
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<PasteStatus[]>>("/api/pastes");
      return res.data;
    },
    initialData,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status === "pending" || p.status === "running")
        ? PASTE_POLL_MS
        : false,
  });
}

/** Queue a link. Returns as soon as the row exists; the reading happens behind it. */
export function useCreatePaste() {
  const queryClient = useQueryClient();
  return useMutation<PasteStatus, Error, { product_url: string }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<PasteStatus>>("/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pasteKeys.all }),
  });
}

/** Put a still-reading link in the bag, where it prices itself when the job lands. */
export function useAddPasteToBag() {
  const queryClient = useQueryClient();
  return useMutation<AddToBagResult, Error, { extraction_request_id: string; quantity: number }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<AddToBagResult>>("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bagKeys.all });
      queryClient.invalidateQueries({ queryKey: pasteKeys.all });
    },
  });
}
