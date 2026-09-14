import { CheckCircle } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { formatEventStamp, paidRows, paidTotalGhs } from "../format";
import type { JourneyPayment } from "../types";

export interface JourneyPaidCardProps {
  pricing: OrderPricingBreakdown;
  adminTotalGhs: number | null;
  payment: JourneyPayment | null;
}

/**
 * "What you paid" (`v2-detail`, design lines 356–361).
 *
 * Read straight from `orders.pricing` — the breakdown struck when the order was
 * created — and never recomputed here. A component that multiplied a rate by a
 * subtotal would be doing money arithmetic in the browser and would drift from
 * what the customer was actually charged the first time a constant moved.
 *
 * The mock's "Receipt" link is NOT drawn: there is no receipt document or URL
 * anywhere in the schema, and a link to nothing is worse than no link. The
 * payment's own reference is shown instead, which is what support asks for.
 */
export function JourneyPaidCard({ pricing, adminTotalGhs, payment }: JourneyPaidCardProps) {
  const rows = paidRows(pricing);
  const total = paidTotalGhs(pricing, adminTotalGhs);

  return (
    <section className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.16s] [animation-duration:0.5s]">
      <h2 className="font-display text-lg leading-none font-bold">What you paid</h2>

      <dl className="tm-nums flex flex-col gap-[9px] text-[13px] leading-none font-medium text-tm-text-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`flex justify-between gap-3 ${row.tone === "muted" ? "text-xs text-tm-text-3" : ""}`}
          >
            <dt>{row.label}</dt>
            <dd className="shrink-0">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-[#E8DDD6] pt-3">
        <span className="text-sm leading-none font-semibold">Total</span>
        <span className="tm-nums text-[22px] leading-none font-bold">
          {formatGhs(total)}
        </span>
      </div>

      {/*
        Only when a `success` payment row exists. An unpaid order shows no line
        here at all rather than "awaiting payment" where a receipt belongs — the
        pay button above already says that.
      */}
      {payment && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs leading-none font-medium text-tm-green">
          <CheckCircle weight="fill" className="size-3.5" aria-hidden />
          {[payment.channelLabel, formatEventStamp(payment.paidAt)]
            .filter((part): part is string => !!part)
            .join(" · ")}
          <span className="tm-nums min-w-0 break-all text-tm-text-3">· {payment.reference}</span>
        </p>
      )}
    </section>
  );
}
