"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import { HISTORY_DAYS } from "../schema";
import type {
  CreateWatchResult,
  DeleteWatchResult,
  WatchHistoryResponse,
  WatchListResponse,
} from "../types";

export const watchKeys = {
  all: ["watches"] as const,
  list: () => [...watchKeys.all, "list"] as const,
  history: (id: string, days: number) => [...watchKeys.all, "history", id, days] as const,
};

/**
 * The caller's active watches, each with its derived stats and sparkline.
 * Nothing is computed here — the stats come from the server so the Home card
 * and the watch page can never disagree about what "lowest in 30 days" means.
 */
export function useWatches() {
  return useQuery<ApiSuccessResponse<WatchListResponse>, Error, WatchListResponse>({
    queryKey: watchKeys.list(),
    queryFn: () => apiFetch<ApiSuccessResponse<WatchListResponse>>("/api/watches"),
    select: (res) => res.data,
    staleTime: 60_000,
  });
}

/** One watch's observation series. Enabled only once an id is known. */
export function useWatchHistory(id: string | null, days: number = HISTORY_DAYS.default) {
  return useQuery<ApiSuccessResponse<WatchHistoryResponse>, Error, WatchHistoryResponse>({
    queryKey: watchKeys.history(id ?? "", days),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<WatchHistoryResponse>>(
        `/api/watches/${id}/history?days=${days}`,
      ),
    select: (res) => res.data,
    enabled: id != null && id !== "",
    staleTime: 60_000,
  });
}

/**
 * Start watching a link. The mutation sends the URL only; the server extracts
 * and prices it, which is why this can take as long as a quote does.
 */
export function useCreateWatch() {
  const queryClient = useQueryClient();
  return useMutation<CreateWatchResult, Error, { url: string }>({
    mutationFn: ({ url }) =>
      apiFetch<ApiSuccessResponse<CreateWatchResult>>("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: watchKeys.all });
    },
  });
}

export function useDeleteWatch() {
  const queryClient = useQueryClient();
  return useMutation<DeleteWatchResult, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiFetch<ApiSuccessResponse<DeleteWatchResult>>(`/api/watches/${id}`, {
        method: "DELETE",
      }).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: watchKeys.all });
    },
  });
}
