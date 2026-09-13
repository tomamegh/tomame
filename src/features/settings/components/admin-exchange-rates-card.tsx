"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise } from "@phosphor-icons/react/ssr";

import { AdminBadge, AdminCard, AdminEmpty, type AdminTone } from "@/components/layout/admin";
import { formatPercent } from "@/features/marketing/format";
import type { ExchangeRate } from "@/lib/exchange-rates/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { AdminButton } from "./admin-controls";
import { describeRateAge, rateAge, type RateFreshness } from "./fx-freshness";

const FRESHNESS_TONE: Record<RateFreshness, AdminTone> = {
  fresh: "green",
  late: "amber",
  stale: "amber",
  unknown: "muted",
};

const FRESHNESS_LABEL: Record<RateFreshness, string> = {
  fresh: "Current",
  late: "Behind",
  stale: "Stale",
  unknown: "Unknown",
};

export interface AdminExchangeRatesCardProps {
  rates: ExchangeRate[];
  /** Server render time, ISO, so age is struck from one clock rather than two. */
  renderedAt: string;
  /** `fx_buffer_pct` as stored. Null when the row is missing. */
  bufferPct: number | null;
  /**
   * The mid-market and buffered USD→GHS rates the engine actually used when it
   * priced the worked example. Taken from the breakdown rather than multiplied
   * here — a component may not do money arithmetic, and a second implementation
   * of "mid × (1 + buffer)" is exactly how two screens end up disagreeing.
   */
  midUsdRate: number | null;
  appliedUsdRate: number | null;
}

/**
 * The FX card.
 *
 * WHAT IT FIXES. The old card printed "Applied (+4%)" next to every currency,
 * with the 4% read from a constant compiled into the bundle. Two things were
 * wrong with that: the buffer is an admin-editable row that may not be 4%, and
 * the buffer applies to the USD→GHS conversion only — a GBP listing is
 * converted to USD at mid-market first, so a "+4% GBP rate" is not a rate
 * anything is ever charged at. It also claimed rates were fetched "every 4
 * hours" with no way of knowing whether the job had run at all.
 *
 * This shows what is in the table, when it landed, who supplied it, and says
 * plainly when the job appears to have stopped.
 */
export function AdminExchangeRatesCard({
  rates,
  renderedAt,
  bufferPct,
  midUsdRate,
  appliedUsdRate,
}: AdminExchangeRatesCardProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date(renderedAt);

  async function refresh() {
    setRefreshing(true);
    try {
      // Admin-authorised on the server; this is not the cron route and carries
      // no secret — the previous version sent `Bearer ${process.env.CRON_SECRET}`
      // from the browser, where that variable is always undefined.
      await apiFetch("/api/pricing/rates/refresh");
      toast.success({
        title: "Rates refreshed",
        description: "Fetched from the configured provider and stored.",
      });
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not refresh rates",
        description: error instanceof Error ? error.message : "The provider did not answer.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const worstState = rates.reduce<RateFreshness>((worst, rate) => {
    const state = rateAge(rate.fetched_at, now).state;
    if (worst === "stale" || state === "stale") return "stale";
    if (worst === "late" || state === "late") return "late";
    if (worst === "unknown" || state === "unknown") return "unknown";
    return "fresh";
  }, "fresh");

  return (
    <AdminCard
      title="Exchange rates"
      blurb="Mid-market rates, fetched by a scheduled job and stored. Every quote is converted at the USD rate below."
      index={3}
      action={
        <AdminButton onClick={refresh} busy={refreshing}>
          <ArrowsClockwise size={14} weight="bold" />
          Fetch now
        </AdminButton>
      }
    >
      {rates.length === 0 ? (
        <AdminEmpty
          title="No rates stored"
          body="The exchange_rates table is empty, so nothing can be quoted at all — the calculator refuses rather than guessing a cedi. Fetch now, and if that fails, check that an exchange-rate provider key is configured."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {worstState === "stale" || worstState === "late" ? (
            <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.55] font-medium text-[#7a4a06]">
              The rates job looks like it has stopped. Quotes are still being priced — at an
              exchange rate that is no longer today&rsquo;s, which is a loss on every order until
              it is fixed. Check that the scheduled job can reach this app.
            </p>
          ) : null}

          <div className="flex flex-col">
            {rates.map((rate) => {
              const age = rateAge(rate.fetched_at, now);
              return (
                <div
                  key={rate.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-tm-hairline py-3 last:border-0"
                >
                  <div>
                    <p className="text-[13px] leading-none font-semibold text-tm-ink">
                      1 {rate.base_currency} = <span className="tm-nums">{rate.rate}</span>{" "}
                      {rate.target_currency}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.45] font-medium text-tm-text-3">
                      {describeRateAge(age)} Supplied by {rate.provider}.
                    </p>
                  </div>
                  <AdminBadge tone={FRESHNESS_TONE[age.state]}>
                    {FRESHNESS_LABEL[age.state]}
                  </AdminBadge>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5 rounded-[16px] bg-tm-paper px-4 py-3.5">
            <span className="text-[12px] font-semibold text-tm-text-2">
              What the customer is charged at
            </span>
            {midUsdRate != null && appliedUsdRate != null ? (
              <p className="tm-nums text-[13px] leading-[1.5] font-medium text-tm-ink">
                1 USD = <span className="font-semibold">{appliedUsdRate}</span> GHS, from a
                mid-market {midUsdRate}
                {bufferPct != null ? (
                  <>
                    {" "}
                    plus the <span className="font-semibold">{formatPercent(bufferPct)}</span>{" "}
                    buffer
                  </>
                ) : null}
                .
              </p>
            ) : (
              <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
                The engine could not price anything just now, so there is no applied rate to show.
              </p>
            )}
            <p className="max-w-[58ch] text-[12px] leading-[1.5] font-medium text-tm-text-3">
              The buffer is added to the USD→GHS conversion only. A GBP or CNY listing is converted
              to USD through the mid-market rates above first, so those two are never marked up
              directly.
            </p>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
