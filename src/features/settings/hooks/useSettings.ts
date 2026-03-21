"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { PricingConfigListResponse, PricingConfigResponse, PricingConstant } from "@/features/pricing/types";
import type { ExchangeRate } from "@/lib/exchange-rates/types";

// ── Query keys ────────────────────────────────────────────────────────────────

export const settingsKeys = {
  pricing: ["admin", "settings", "pricing"] as const,
  pricingConstants: ["admin", "settings", "pricing-constants"] as const,
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

export function usePricingConstants() {
  return useQuery<ApiSuccessResponse<{ constants: PricingConstant[] }>, Error, PricingConstant[]>({
    queryKey: settingsKeys.pricingConstants,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ constants: PricingConstant[] }>>("/api/admin/pricing-constants"),
    select: (res) => res.data.constants,
    staleTime: 30_000,
  });
}

export function useUpdatePricingConstant() {
  const queryClient = useQueryClient();
  return useMutation<
    ApiSuccessResponse<PricingConstant>,
    Error,
    { key: string; value: number }
  >({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<PricingConstant>>("/api/admin/pricing-constants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.pricingConstants });
    },
  });
}

export function useExchangeRates() {
  return useQuery<ApiSuccessResponse<{ rates: ExchangeRate[] }>, Error, ExchangeRate[]>({
    queryKey: settingsKeys.exchangeRates,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ rates: ExchangeRate[] }>>("/api/admin/exchange-rates"),
    select: (res) => res.data.rates,
    staleTime: 60_000,
  });
}
