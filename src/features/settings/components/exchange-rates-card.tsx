"use client";

import { RefreshCwIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useExchangeRates } from "../hooks/useSettings";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/auth/api-helpers";
import { useQueryClient } from "@tanstack/react-query";
import { settingsKeys } from "../hooks/useSettings";
import { DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";

const CURRENCY_LABELS: Record<string, { flag: string; label: string }> = {
  USD: { flag: "🇺🇸", label: "US Dollar" },
  GBP: { flag: "🇬🇧", label: "British Pound" },
  CNY: { flag: "🇨🇳", label: "Chinese Yuan" },
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ExchangeRatesCard() {
  const { data: rates, isLoading } = useExchangeRates();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await apiFetch("/api/cron/exchange-rates");
      await queryClient.invalidateQueries({ queryKey: settingsKeys.exchangeRates });
      toast.success("Exchange rates refreshed");
    } catch {
      toast.error("Failed to refresh rates");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Live Exchange Rates</CardTitle>
            <CardDescription className="mt-1">
              Mid-market rates fetched every 4 hours. Pricing applies a 4% buffer on top.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Spinner className="size-3.5" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm h-24">
            <Spinner className="size-4" />
            <span>Loading…</span>
          </div>
        ) : !rates?.length ? (
          <p className="text-sm text-stone-400 text-center py-6">No rates available yet.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {rates.map((rate) => {
              const meta = CURRENCY_LABELS[rate.base_currency];
              const appliedRate = rate.rate * (1 + DEFAULT_FX_BUFFER_PCT);
              return (
                <div key={rate.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl leading-none">{meta?.flag ?? "🌐"}</span>
                    <div>
                      <p className="text-sm font-medium text-stone-800">
                        {rate.base_currency} → GHS
                      </p>
                      <p className="text-xs text-stone-400">{meta?.label}</p>
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-stone-400">Mid-market</span>
                      <span className="font-mono text-sm font-semibold text-stone-800">
                        {rate.rate.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-stone-400">Applied (+4%)</span>
                      <Badge variant="secondary" className="font-mono text-xs font-semibold">
                        {appliedRate.toFixed(4)}
                      </Badge>
                    </div>
                    <p className="text-xs text-stone-400">
                      Updated {formatRelativeTime(rate.fetched_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
