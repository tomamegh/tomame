"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PriceWatchRow, SourcingStatus } from "@/db/queries/price-watches";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { AnswerSourcingRequestInput } from "../schema";

const queueKey = (status: SourcingStatus | "all") => ["sourcing-queue", status] as const;

/** The buyer's queue. Oldest first — the server orders it; this does not re-sort. */
export function useSourcingQueue(status: SourcingStatus | "all") {
  return useQuery<PriceWatchRow[]>({
    queryKey: queueKey(status),
    queryFn: async () => {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await apiFetch<ApiSuccessResponse<PriceWatchRow[]>>(`/api/admin/sourcing-requests${qs}`);
      return res.data;
    },
  });
}

/** Answer one. The two facts, never a total — the engine works out what is charged. */
export function useAnswerSourcing() {
  const queryClient = useQueryClient();
  return useMutation<PriceWatchRow, Error, { id: string } & AnswerSourcingRequestInput>({
    mutationFn: async ({ id, ...body }) => {
      const res = await apiFetch<ApiSuccessResponse<PriceWatchRow>>(`/api/admin/sourcing-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sourcing-queue"] }),
  });
}
