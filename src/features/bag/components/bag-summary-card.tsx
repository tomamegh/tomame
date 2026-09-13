"use client";

import { LockSimple } from "@phosphor-icons/react/ssr";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { formatGhs, formatUsd } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import type { BagView } from "../types";
import { buildBagSummaryRows, formatLockCountdown } from "./format";

export interface BagSummaryCardProps {
  view: BagView;
  deliveryZone: DeliveryZoneRow | null;
  now: Date;
}

/**
 * The sticky right rail — `v2-bag` lines 245–256: "Pay once for everything",
 * the summary rows at `500 13px/1` with tabular numerals, the total at
 * `700 30px/1` over a dashed rule, and "≈ $x · rate locked 23h 12m".
 *
 * Every number is the server's `BagView`; the countdown is the only thing
 * computed here and it is time, not money. The payment selector and the pay
 * button arrive with checkout (F3).
 */
export function BagSummaryCard({ view, deliveryZone, now }: BagSummaryCardProps) {
  const rows = buildBagSummaryRows(view, deliveryZone);
  const countdown = formatLockCountdown(view.rate_locked_until, now);

  return (
    <aside
      data-testid="bag-summary"
      className="tm-up sticky top-5 flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.12s] [animation-duration:0.5s]"
    >
      <h2 className="font-display text-lg leading-none font-bold">Pay once for everything</h2>

      <dl className="tm-nums flex flex-col gap-[9px] text-[13px] leading-none font-medium text-tm-text-2">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-4">
            <dt>{row.label}</dt>
            <dd className={cn(row.tone === "saving" && "text-tm-green", row.tone === "free" && "font-bold text-tm-green")}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between border-t border-dashed border-[#E8DDD6] pt-3.5">
        <span className="text-[15px] leading-none font-semibold">Total</span>
        <span className="text-right">
          <span className="tm-nums block text-[30px] leading-none font-bold tracking-[-0.02em]">{formatGhs(view.total_ghs)}</span>
          <span className="tm-nums text-xs leading-[1.7] font-medium text-tm-text-3">
            {view.total_usd > 0 && `≈ ${formatUsd(view.total_usd)}`}
            {view.total_usd > 0 && countdown && " · "}
            {countdown && (
              <span className="inline-flex items-center gap-1">
                <LockSimple className="size-3" aria-hidden />
                rate locked {countdown}
              </span>
            )}
          </span>
        </span>
      </div>

      {view.has_unpriced_lines && (
        <p className="text-xs leading-[1.5] font-medium text-tm-amber">
          One or more lines could not be priced right now, so the total leaves them out.
        </p>
      )}
    </aside>
  );
}
