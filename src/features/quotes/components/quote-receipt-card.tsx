"use client";

import {
  BookmarkSimple,
  LockSimple,
  Minus,
  Plus,
  Tote,
  Truck,
} from "@phosphor-icons/react/ssr";

import {
  buildReceiptRows,
  RECEIPT_ROW_DELAYS,
  splitGhsTotal,
} from "@/features/app-home/components/format";
import { RECEIPT_ROW_ICONS } from "@/features/app-home/components/receipt-icons";
import { formatGhsCompact, formatUsd } from "@/features/marketing/format";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { PricingBreakdown } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { formatDoorDeliveryLabel, formatRateLockDeadline } from "./format";

export interface QuoteReceiptCardProps {
  /** Server-priced breakdown, or null when the line cannot be priced. */
  pricing: PricingBreakdown | null;
  /** Why `pricing` is null — shown where the receipt would be. */
  unavailableReason: string | null;
  /** The zone the quote assumes, from `pickDefaultDoorZone`. Null hides the row. */
  deliveryZone: DeliveryZoneRow | null;
  /** The instant the quote landed, so the lock deadline is stable across renders. */
  now: Date;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  onQuantityChange: (quantity: number) => void;
  /** True while a quantity change is being re-priced by the server. */
  repricing: boolean;
  onContinue: () => void;
  /** False when a gap is unfilled or the last re-price failed. */
  canContinue: boolean;
  continuePending: boolean;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
}

/**
 * The right rail: the landed total, the rate lock, the printed receipt, the
 * delivery line and the two actions.
 *
 * Every figure is rendered from the server's `PricingBreakdown` — the rows come
 * from the one shared `buildReceiptRows`, the percentages off the breakdown
 * (the engine charges 4–8% by category and 10% US tax, not the mock's sample
 * 5% and 8%), and the lock deadline is the server's `rate_locked_until`. There
 * is no arithmetic in this file.
 */
export function QuoteReceiptCard({
  pricing,
  unavailableReason,
  deliveryZone,
  now,
  quantity,
  minQuantity,
  maxQuantity,
  onQuantityChange,
  repricing,
  onContinue,
  canContinue,
  continuePending,
  watching,
  watchPending,
  onToggleWatch,
}: QuoteReceiptCardProps) {
  const rows = pricing ? buildReceiptRows(pricing) : [];
  const total =
    pricing && Number.isFinite(pricing.total_ghs)
      ? splitGhsTotal(pricing.total_ghs)
      : null;

  const lockDeadline = pricing?.rate_locked_until
    ? formatRateLockDeadline(pricing.rate_locked_until, now)
    : null;

  return (
    <section
      aria-label="Landed price"
      aria-busy={repricing}
      className="overflow-hidden rounded-[20px] border border-tm-border bg-card lg:rounded-[24px]"
    >
      <header className="flex flex-col gap-1.5 bg-[linear-gradient(160deg,#FFF1EC,#FFF7EA)] px-4 py-3.5 lg:px-[22px] lg:pt-[22px] lg:pb-4">
        <span className="text-[10px] leading-none font-semibold tracking-[0.14em] text-tm-coral-strong uppercase lg:text-[11px] lg:leading-none">
          Landed in Accra
        </span>

        {total ? (
          /*
            GH₵ leads and the dollar echo follows, on one baseline as the mock
            has it. `total_usd` is the SERVER's division of the landed total by
            the rate it actually applied -- doing that arithmetic here would be
            money maths in the browser, and would drift from the receipt above
            the moment the two used different rates. Older stored breakdowns do
            not carry the field, so the echo is simply omitted for them.
          */
          <div className="flex flex-wrap items-baseline gap-2.5">
            <p className="tm-pop tm-nums text-[28px] leading-none font-bold tracking-[-0.03em] sm:text-[34px] sm:leading-none lg:text-[40px] lg:leading-none [animation-delay:1.2s] [animation-duration:0.6s]">
              {total.whole}
              {total.fraction && (
                <span className="text-[20px] text-tm-text-3 sm:text-[24px] lg:text-[28px]">
                  {total.fraction}
                </span>
              )}
            </p>
            {pricing?.total_usd != null && Number.isFinite(pricing.total_usd) && (
              <span className="tm-nums text-sm leading-none font-medium text-tm-text-3">
                ≈ {formatUsd(pricing.total_usd)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[20px] leading-[1.2] font-bold">
            Not priced yet
          </p>
        )}

        {lockDeadline && pricing && (
          <span className="tm-nums flex items-center gap-1.5 text-xs leading-none font-medium text-tm-text-2">
            <LockSimple className="size-4 shrink-0" aria-hidden />
            Rate {pricing.exchange_rate.toFixed(2)} locked until {lockDeadline}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-2 px-4 py-3 lg:gap-2.5 lg:px-[22px] lg:py-4">
        {rows.length > 0 ? (
          <>
            <dl className="tm-nums flex flex-col gap-2 text-[12px] leading-none font-medium text-tm-text-2 lg:gap-2.5 lg:text-[13px] lg:leading-none">
              {rows.map((row, index) => {
                const RowIcon = RECEIPT_ROW_ICONS[row.icon];
                return (
                  <div
                    key={row.key}
                    className="tm-up flex items-center justify-between gap-3 [animation-duration:0.45s]"
                    style={{
                      animationDelay: RECEIPT_ROW_DELAYS[index] ?? "0.85s",
                    }}
                  >
                    <dt className="flex items-center gap-2">
                      <RowIcon
                        weight="duotone"
                        className="size-3.5 shrink-0 text-tm-coral lg:size-4"
                        aria-hidden
                      />
                      {row.label}
                    </dt>
                    <dd className="text-tm-ink">{row.value}</dd>
                  </div>
                );
              })}
            </dl>

            {pricing?.fee_calculation_note && (
              <p className="text-[11px] leading-[1.4] font-medium text-tm-text-3">
                {pricing.fee_calculation_note}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-[14px] bg-tm-amber-bg px-3.5 py-3 text-[13px] leading-[1.45] font-medium text-tm-text-2">
            {unavailableReason ??
              "We could not read a price for this link yet."}
          </p>
        )}

        {deliveryZone && (
          <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#E8DDD6] pt-2.5 text-[12px] leading-none font-medium text-tm-text-2 lg:text-[13px] lg:leading-none">
            <span className="flex items-center gap-2">
              <Truck
                weight="duotone"
                className="size-4 shrink-0 text-tm-green"
                aria-hidden
              />
              {formatDoorDeliveryLabel(deliveryZone.name)}
            </span>
            {deliveryZone.fee_ghs > 0 ? (
              <span className="tm-nums text-right text-tm-text-3">
                from {formatGhsCompact(deliveryZone.fee_ghs)}, chosen at checkout
              </span>
            ) : (
              <span className="font-bold text-tm-green">Free</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1.5 pb-4 lg:px-[22px] lg:pb-[22px]">
        <div className="flex items-center justify-between gap-3">
          <span id="quote-quantity-label" className="text-sm leading-none font-semibold">
            Quantity
          </span>
          <div className="flex h-10 items-center rounded-full border border-tm-border px-1">
            <StepperButton
              label="Decrease quantity"
              disabled={quantity <= minQuantity}
              onClick={() => onQuantityChange(quantity - 1)}
            >
              <Minus className="size-4" aria-hidden />
            </StepperButton>
            <output
              aria-labelledby="quote-quantity-label"
              aria-live="polite"
              className="tm-nums w-9 text-center text-[15px] leading-none font-semibold"
            >
              {quantity}
            </output>
            <StepperButton
              label="Increase quantity"
              disabled={quantity >= maxQuantity}
              onClick={() => onQuantityChange(quantity + 1)}
            >
              <Plus className="size-4" aria-hidden />
            </StepperButton>
          </div>
        </div>

        {/*
          Desktop only. Below `lg` these two live in `QuoteActionBar`, pinned to
          the bottom edge as the 390px artboard has them — rendering both would
          give the screen two "Continue to payment" buttons.
        */}
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || continuePending || repricing}
          className={cn(
            "tm-cta-gradient hidden h-[50px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold lg:flex",
            "shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)] transition-[filter,opacity]",
            "hover:brightness-105 focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
          )}
        >
          <Tote weight="bold" className="size-[18px]" aria-hidden />
          {continuePending ? "Creating your order…" : "Continue to payment"}
        </button>

        <button
          type="button"
          onClick={onToggleWatch}
          // Disabled once watching: there is no unwatch endpoint, and a live
          // button that does nothing is worse than a clearly spent one.
          disabled={watchPending || watching}
          aria-pressed={watching}
          className={cn(
            "hidden h-[46px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] bg-card text-sm leading-none font-semibold lg:flex",
            "transition-colors hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            watching ? "border-tm-coral text-tm-coral-strong" : "border-tm-border",
          )}
        >
          <BookmarkSimple
            weight={watching ? "fill" : "regular"}
            className="size-4"
            aria-hidden
          />
          {watching ? "Watching this price" : "Watch price instead"}
        </button>
      </div>
    </section>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full bg-[var(--tm-pill-bg)] transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
