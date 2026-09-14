"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, LockSimple } from "@phosphor-icons/react/ssr";

import { formatGhs, formatUsd } from "@/features/marketing/format";
import type { PaymentChannel } from "@/features/payments/types";
import { cn } from "@/lib/utils";
import type { BagPayment } from "../hooks/useBagPayment";
import type { BagView } from "../types";
import { buildBagSummaryRows, formatLockCountdown } from "./format";

export interface BagSummaryCardProps {
  view: BagView;
  now: Date;
  /** `site_settings.payment_channels` — labels, dots and Paystack channels, all server-owned. */
  paymentChannels: PaymentChannel[];
  /** `site_settings.payment_hold_note`; the line under the button disappears when unset. */
  paymentHoldNote: string | null;
  /** Selection and the pay action, owned by `BagView` so the 390px bar shares them. */
  payment: BagPayment;
  /** True when nothing here may start a payment — no lines, an unpriced line, or no delivery chosen. */
  blocked: boolean;
}

/**
 * The sticky right rail — `v2-bag` lines 245–267: "Pay once for everything",
 * the summary rows at `500 13px/1` with tabular numerals, the total at
 * `700 30px/1` over a dashed rule, "≈ $x · rate locked 23h 12m", the 46 px
 * channel selector, the 54 px gradient pay button and the hold line.
 *
 * Every figure is the server's `BagView`; the countdown is the only thing
 * computed here and it is time, not money. Paying is two server calls —
 * checkout builds the order group, initialize opens the Paystack transaction —
 * and the browser only ever carries ids between them.
 */
export function BagSummaryCard({ view, now, paymentChannels, paymentHoldNote, payment, blocked }: BagSummaryCardProps) {
  const rows = buildBagSummaryRows(view);
  const countdown = formatLockCountdown(view.rate_locked_until, now);
  const { channelId, setChannelId, busy, payBag } = payment;

  return (
    <aside
      data-testid="bag-summary"
      className="tm-up flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] lg:sticky lg:top-5 [animation-delay:0.12s] [animation-duration:0.5s]"
    >
      <h2 className="font-display text-lg leading-none font-bold">Pay once for everything</h2>

      <dl className="tm-nums flex flex-col gap-[9px] text-[13px] leading-none font-medium text-tm-text-2">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-4">
            <dt>{row.label}</dt>
            <dd
              className={cn(
                row.tone === "saving" && "text-tm-green",
                row.tone === "free" && "font-bold text-tm-green",
                row.tone === "muted" && "text-tm-text-3",
              )}
            >
              {row.value}
            </dd>
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

      {/*
        A line with our team comes FIRST and replaces the generic message (065).
        Both flags are up at once — an unanswered line is unpriced too — and
        "could not be priced" reads as something the customer should go and fix,
        which would send them round a loop that ends back here.
      */}
      {view.has_sourcing_lines ? (
        <p className="text-xs leading-[1.5] font-medium text-tm-amber">
          One of your items is with our team. We are pricing it by hand, and you
          can pay for everything together as soon as it is done.
        </p>
      ) : (
        view.has_unpriced_lines && (
          <p className="text-xs leading-[1.5] font-medium text-tm-amber">
            One or more lines could not be priced right now, so the total leaves them out.
          </p>
        )
      )}

      {paymentChannels.length > 0 && (
        <div role="group" aria-labelledby="bag-pay-with" className="flex flex-col gap-2">
          <p id="bag-pay-with" className="text-[13px] leading-none font-semibold text-tm-text-2">
            Pay with
          </p>
          <div className="grid grid-cols-2 gap-2">
            {paymentChannels.map((channel) => {
              const selected = channel.id === channelId;
              return (
                <button
                  key={channel.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => setChannelId(channel.id)}
                  className={cn(
                    "flex h-[46px] items-center justify-center gap-2 rounded-xl text-[13px] leading-none font-semibold transition-opacity disabled:opacity-60",
                    selected ? "border-2 border-tm-coral bg-[#FFF8F5]" : "border border-tm-border text-tm-text-2",
                  )}
                >
                  {channel.dot ? (
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: channel.dot }} aria-hidden />
                  ) : channel.paystack_channel === "card" ? (
                    <CreditCard className="size-4 shrink-0" aria-hidden />
                  ) : null}
                  {channel.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Below `lg` this button is `BagPayBar`, pinned to the bottom edge. */}
      <button
        type="button"
        onClick={payBag}
        disabled={blocked || busy}
        aria-busy={busy}
        className={cn(
          "tm-cta-gradient hidden h-[54px] items-center justify-center gap-2 rounded-[14px] text-base leading-none font-bold text-white lg:flex",
          "shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {busy ? (
          "Redirecting to Paystack…"
        ) : (
          <>
            Pay {formatGhs(view.total_ghs)}
            <ArrowRight weight="bold" className="size-4" aria-hidden />
          </>
        )}
      </button>

      {paymentHoldNote && (
        <Link
          href="/policies#payment"
          className="flex items-center justify-center gap-1.5 text-center text-xs leading-[1.4] font-medium text-tm-text-3 hover:underline"
        >
          <LockSimple className="size-3.5 shrink-0" aria-hidden />
          {paymentHoldNote}
        </Link>
      )}
    </aside>
  );
}
