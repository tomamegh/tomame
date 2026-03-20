"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { PricingConfigListResponse, PricingConfigResponse } from "@/features/pricing/types";
import type { DbExchangeRate } from "@/lib/exchange-rates/types";

// ── Query keys ────────────────────────────────────────────────────────────────

export const settingsKeys = {
  pricing: ["admin", "settings", "pricing"] as const,
  exchangeRates: ["admin", "settings", "exchange-rates"] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePricingConfig() {
  return useQuery<ApiSuccessResponse<PricingConfigListResponse>, Error, PricingConfigListResponse>({
    queryKey: settingsKeys.pricing,
    queryFn: () => apiFetch<ApiSuccessResponse<PricingConfigListResponse>>("/api/admin/pricing"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

export function useUpdatePricingConfig() {
  const queryClient = useQueryClient();
  return useMutation<
    ApiSuccessResponse<PricingConfigResponse>,
    Error,
    { region: "USA" | "UK" | "CHINA"; baseShippingFeeUsd: number; serviceFeePercentage: number }
  >({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<PricingConfigResponse>>("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.pricing });
    },
  });
}

export function useExchangeRates() {
  return useQuery<ApiSuccessResponse<{ rates: DbExchangeRate[] }>, Error, DbExchangeRate[]>({
    queryKey: settingsKeys.exchangeRates,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ rates: DbExchangeRate[] }>>("/api/admin/exchange-rates"),
    select: (res) => res.data.rates,
    staleTime: 60_000,
  });
}
