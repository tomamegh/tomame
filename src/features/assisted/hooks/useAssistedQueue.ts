"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssistedRequestRow, AssistedRequestStatus } from "@/db/queries/assisted-requests";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { TransitionAssistedRequestInput } from "../schema";

const queueKey = (status: AssistedRequestStatus | "all") => ["assisted-queue", status] as const;

/** The buyer's queue. Oldest first — the server orders it; this does not re-sort. */
export function useAssistedQueue(status: AssistedRequestStatus | "all") {
  return useQuery<AssistedRequestRow[]>({
    queryKey: queueKey(status),
    queryFn: async () => {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await apiFetch<ApiSuccessResponse<AssistedRequestRow[]>>(`/api/admin/assisted-requests${qs}`);
      return res.data;
    },
  });
}

/**
 * Claim or close one. `from` is the status this buyer saw, so the server can
 * refuse when someone else moved it first — the 409 is surfaced, not swallowed.
 */
export function useMoveAssistedRequest() {
  const queryClient = useQueryClient();
  return useMutation<
    AssistedRequestRow,
    Error,
    { id: string; from: AssistedRequestStatus } & TransitionAssistedRequestInput
  >({
    mutationFn: async ({ id, ...body }) => {
      const res = await apiFetch<ApiSuccessResponse<AssistedRequestRow>>(`/api/admin/assisted-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assisted-queue"] }),
  });
}
