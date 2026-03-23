"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { ExchangeRate } from "@/lib/exchange-rates/types";

// ── Query keys ────────────────────────────────────────────────────────────────

export const settingsKeys = {
  exchangeRates: ["admin", "settings", "exchange-rates"] as const,
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
