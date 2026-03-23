"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { ExchangeRate } from "@/lib/exchange-rates/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PricingConstant {
  id: string;
  key: string;
  value: number;
  label: string;
  description: string;
  unit: string;
  updated_at: string;
  updated_by: string | null;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const settingsKeys = {
  exchangeRates: ["admin", "settings", "exchange-rates"] as const,
  pricingConstants: ["admin", "settings", "pricing-constants"] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useExchangeRates() {
  return useQuery<ApiSuccessResponse<{ rates: ExchangeRate[] }>, Error, ExchangeRate[]>({
    queryKey: settingsKeys.exchangeRates,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ rates: ExchangeRate[] }>>("/api/admin/exchange-rates"),
    select: (res) => res.data.rates,
    staleTime: 60_000,
  });
}

export function usePricingConstants() {
  return useQuery<
    ApiSuccessResponse<{ constants: PricingConstant[] }>,
    Error,
    PricingConstant[]
  >({
    queryKey: settingsKeys.pricingConstants,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ constants: PricingConstant[] }>>(
        "/api/admin/pricing-constants",
      ),
    select: (res) => res.data.constants,
    staleTime: 60_000,
  });
}
