"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { QuoteCheckRow } from "@/db/queries/quote-checks";
import type { QuoteCheckKind, QuoteCheckStatus } from "@/features/extraction/pay-gate";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { DecideQuoteCheckInput } from "../schema";

const key = (kind: QuoteCheckKind, status: QuoteCheckStatus | "all") => ["quote-checks", kind, status] as const;

/** One admin queue. Open checks come oldest first; the server orders it. */
export function useQuoteChecks(kind: QuoteCheckKind, status: QuoteCheckStatus | "all") {
  return useQuery<QuoteCheckRow[]>({
    queryKey: key(kind, status),
    queryFn: async () => {
      const qs = new URLSearchParams({ kind, ...(status === "all" ? {} : { status }) });
      return (await apiFetch<ApiSuccessResponse<QuoteCheckRow[]>>(`/api/admin/quote-checks?${qs.toString()}`)).data;
    },
    refetchInterval: 60_000,
  });
}

/** Decide one check; a 409 (someone else decided it first) is surfaced to the caller. */
export function useDecideQuoteCheck() {
  const queryClient = useQueryClient();
  return useMutation<QuoteCheckRow, Error, { id: string } & DecideQuoteCheckInput>({
    mutationFn: async ({ id, ...body }) =>
      (
        await apiFetch<ApiSuccessResponse<QuoteCheckRow>>(`/api/admin/quote-checks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["quote-checks"] }),
  });
}
