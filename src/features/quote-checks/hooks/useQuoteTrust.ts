"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import type { StockCheckView } from "@/features/extraction/types";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { ReportWrongPriceInput } from "../schema";

export const quoteTrustKeys = {
  stock: (extractionId: string) => ["quote-trust", "stock", extractionId] as const,
};

async function postStockCheck(extractionId: string): Promise<StockCheckView> {
  const res = await apiFetch<ApiSuccessResponse<StockCheckView>>(`/api/extractions/${extractionId}/stock-check`, {
    method: "POST",
  });
  return res.data;
}

/**
 * The customer's view of one line's stock check, for screens that hold only
 * the pay hold (the bag). `POST` because asking also opens the check if it is
 * not open yet, which is idempotent on the server; read once per line.
 */
export function useStockCheckView(extractionId: string | null, enabled: boolean) {
  return useQuery<StockCheckView>({
    queryKey: quoteTrustKeys.stock(extractionId ?? ""),
    queryFn: () => postStockCheck(extractionId!),
    enabled: enabled && !!extractionId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Open the stock check when the customer taps "Confirm on WhatsApp" on a
 * quote, so staff hear about it even if the WhatsApp message is never sent.
 * Fire-and-forget: `keepalive` lets it finish while the browser leaves for wa.me.
 */
export function openStockCheck(extractionId: string): void {
  void fetch(`/api/extractions/${extractionId}/stock-check`, { method: "POST", keepalive: true }).catch(() => {
    // The WhatsApp message carries the quote reference; staff can still find it.
  });
}

/** "Report a wrong price": one row in the staff price queue. Never changes the price. */
export function useReportWrongPrice(extractionId: string) {
  return useMutation<unknown, Error, ReportWrongPriceInput>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<unknown>>(`/api/extractions/${extractionId}/price-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
  });
}
