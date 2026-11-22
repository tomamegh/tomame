"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookmarkSimple,
  HandWaving,
  Minus,
  Plus,
  Tag,
  Tote,
  Truck,
} from "@phosphor-icons/react/ssr";

import { PriceBreakdownList, PriceBreakdownSheet, type PriceBreakdownRow } from "@/components/price/price-breakdown";
import { PriceDisplay } from "@/components/price/price-display";
import { Button } from "@/components/ui/button";
import { HERO_PRICE_PARTS } from "@/config/price-story";
import { buildReceiptRows } from "@/features/app-home/components/format";
import { RECEIPT_ROW_ICONS } from "@/features/app-home/components/receipt-icons";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { PayHold } from "@/features/extraction/pay-gate";
import type { StoreShippingOption } from "@/features/extraction/store-shipping";
import type { StockCheckView } from "@/features/extraction/types";
import { formatGhs, formatGhsCompact, formatUsd } from "@/features/marketing/format";
import { PayHoldNotice } from "@/features/quote-checks/components/pay-hold-notice";
import { ReportPriceLink } from "@/features/quote-checks/components/report-price-dialog";
import type { PricingBreakdown } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { formatDoorDeliveryLabel, formatEtaRange, formatRateLockDeadline } from "./format";
import { FreightCheckNotice } from "./freight-check-notice";

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
  /** The store's shipping services to our hub when it offers more than one (eBay). */
  shippingOptions?: StoreShippingOption[];
  onShippingChange?: (code: string) => void;
  /** True while a quantity change is being re-priced by the server. */
  repricing: boolean;
  /**
   * Non-null while the freight weight is being checked: when this screen
   * first saw it, in the browser's clock. The total is provisional meanwhile.
   */
  freightCheckSeenAt?: number | null;
  /** Why this item cannot be paid for yet (pay-gate.ts); null when it can. */
  payHold?: PayHold | null;
  /** The stock check, when the item needs one (A7). */
  stockCheck?: StockCheckView | null;
  /** The quote's extraction id, for the stock check and "Report a wrong price". */
  extractionId?: string | null;
  /** Why the store price is what it is, as facts (price-context.ts): a store discount, our earlier read. */
  priceNotes?: string[];
  /** "$" or "£", the listing currency, for the price report form. */
  currencySymbol?: string;
  onContinue: () => void;
  /** Bag count once THIS screen added the line; the CTA then hands off to the bag. */
  addedCount: number | null;
  /** False when a gap is unfilled or the last re-price failed. */
  canContinue: boolean;
  /** Nobody has confirmed we can buy this (065): the CTA asks a person instead. */
  needsSourcing?: boolean;
  onAskToSource?: () => void;
  sourcePending?: boolean;
  continuePending: boolean;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
}

/**
 * The landed-price card: the total and the rate lock first, what's included
 * one tap away (a bottom sheet on phones, inline from `lg`), then anything
 * holding payment, then the options and the action.
 *
 * Every figure is the server's `PricingBreakdown`; rows come from the shared
 * `buildReceiptRows` with the price-story labels. No arithmetic here.
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
  shippingOptions = [],
  onShippingChange,
  repricing,
  freightCheckSeenAt = null,
  payHold = null,
  stockCheck = null,
  priceNotes = [],
  extractionId = null,
  currencySymbol = "$",
  onContinue,
  addedCount,
  canContinue,
  needsSourcing = false,
  onAskToSource,
  sourcePending = false,
  continuePending,
  watching,
  watchPending,
  onToggleWatch,
}: QuoteReceiptCardProps) {
  const checking = freightCheckSeenAt != null;
  // A needs_review breakdown carries total_ghs 0 — not a price (the bag treats it the same way).
  const needsReview = pricing?.pricing_method === "needs_review";
  const priced = pricing != null && !needsReview && Number.isFinite(pricing.total_ghs);
  const total = priced ? formatGhs(pricing.total_ghs) : null;
  const lockDeadline = pricing?.rate_locked_until ? formatRateLockDeadline(pricing.rate_locked_until, now) : null;
  const unavailable = payHold?.kind === "unavailable";

  const rows: PriceBreakdownRow[] = pricing
    ? buildReceiptRows(pricing).map((row) => ({
        key: row.key,
        label: row.label,
        value: row.value,
        icon: RECEIPT_ROW_ICONS[row.icon],
        pending: checking && row.key === "freight" ? "Checking" : null,
      }))
    : [];
  const note = needsReview
    ? "Our team will price the freight for this item before you pay."
    : checking
      ? null
      : (pricing?.fee_calculation_note ?? null);
  const summary = `Includes ${HERO_PRICE_PARTS}`;

  return (
    <section
      aria-label="Landed price"
      aria-busy={repricing || checking}
      className="flex flex-col gap-4 rounded-[24px] border border-border bg-card p-4 sm:p-5 lg:p-[22px]"
    >
      {total && pricing ? (
        <PriceDisplay
          amount={total}
          size="lg"
          usd={pricing.total_usd != null && Number.isFinite(pricing.total_usd) ? `≈ ${formatUsd(pricing.total_usd)}` : null}
          lock={lockDeadline ? `Rate ${pricing.exchange_rate.toFixed(2)} locked until ${lockDeadline}` : null}
          provisional={checking || repricing}
          roll={!repricing}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="tm-overline text-tm-coral-strong dark:text-tm-coral">Landed in Accra</span>
          <p className="tm-title-2 text-foreground">{needsReview ? "Freight to confirm" : "Not priced yet"}</p>
          {!pricing && (
            <p className="tm-body text-muted-foreground">{unavailableReason ?? "We couldn't read a price for this link yet."}</p>
          )}
        </div>
      )}

      {total && pricing && priceNotes.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-tm-green/10 px-3 py-2 text-[13px] leading-snug font-medium text-tm-green">
          <Tag weight="duotone" className="mt-px size-4 shrink-0" aria-hidden />
          <span>{priceNotes.join(". ")}.</span>
        </p>
      )}

      {rows.length > 0 && (
        <>
          <PriceBreakdownSheet rows={rows} note={note} summary={summary} total={total} className="lg:hidden" />
          <PriceBreakdownList rows={rows} note={note} className="hidden border-t border-dashed border-border pt-4 lg:flex" />
        </>
      )}

      {checking && freightCheckSeenAt != null && <FreightCheckNotice seenAt={freightCheckSeenAt} />}
      <PayHoldNotice hold={payHold} stockCheck={stockCheck} extractionId={extractionId} />

      {deliveryZone && (
        <div className="flex items-start justify-between gap-3 text-[13px] leading-[1.35] font-medium text-muted-foreground">
          <span className="flex min-w-0 items-start gap-2">
            <Truck weight="duotone" className="mt-px size-4 shrink-0 text-tm-green" aria-hidden />
            <span className="min-w-0">{formatDoorDeliveryLabel(deliveryZone.name)}</span>
          </span>
          {deliveryZone.fee_ghs > 0 ? (
            <span className="tm-nums shrink-0 text-right">from {formatGhsCompact(deliveryZone.fee_ghs)}</span>
          ) : (
            <span className="shrink-0 font-semibold text-tm-green">Free</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {shippingOptions.length > 1 && pricing && onShippingChange && (
          <ShippingOptionPicker
            options={shippingOptions}
            selectedCode={pricing.store_shipping_option?.code ?? shippingOptions[0]!.code}
            disabled={repricing}
            onChange={onShippingChange}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <span id="quote-quantity-label" className="text-sm leading-none font-semibold text-foreground">
            Quantity
          </span>
          <div className="flex h-11 items-center rounded-full border border-border px-1">
            <StepperButton label="Decrease quantity" disabled={quantity <= minQuantity} onClick={() => onQuantityChange(quantity - 1)}>
              <Minus className="size-4" aria-hidden />
            </StepperButton>
            <output aria-labelledby="quote-quantity-label" aria-live="polite" className="tm-nums w-9 text-center text-[15px] leading-none font-semibold">
              {quantity}
            </output>
            <StepperButton label="Increase quantity" disabled={quantity >= maxQuantity} onClick={() => onQuantityChange(quantity + 1)}>
              <Plus className="size-4" aria-hidden />
            </StepperButton>
          </div>
        </div>

        {/* Desktop only: below `lg` the action lives in `QuoteActionBar`, pinned above the safe area. */}
        <div className="hidden flex-col gap-2 lg:flex">
          {addedCount != null ? (
            <>
              <Button asChild variant="primary" size="lg" className="w-full">
                <Link href="/app/bag">
                  <Tote weight="bold" className="size-[18px]" aria-hidden />
                  View bag · {addedCount}
                  <ArrowRight weight="bold" className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="touch" className="w-full">
                <Link href="/app/orders/new">
                  <Plus weight="bold" className="size-4" aria-hidden />
                  Add another item
                </Link>
              </Button>
            </>
          ) : needsSourcing ? (
            <>
              <Button variant="primary" size="lg" className="w-full" onClick={onAskToSource} loading={sourcePending}>
                {!sourcePending && <HandWaving weight="bold" className="size-[18px]" aria-hidden />}
                {sourcePending ? "Sending to our team" : "Ask us to source this"}
              </Button>
              <p className="tm-caption text-center text-muted-foreground">
                It goes in your bag while a buyer checks it. You pay nothing until we&apos;ve confirmed we can get it.
              </p>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onContinue}
              loading={continuePending}
              disabled={!canContinue || repricing || checking || unavailable}
            >
              {!continuePending && <Tote weight="bold" className="size-[18px]" aria-hidden />}
              {ctaLabel({ continuePending, checking, unavailable })}
            </Button>
          )}

          {!needsSourcing && (
            <Button
              variant="outline"
              size="touch"
              className={cn("w-full", watching && "border-tm-coral text-tm-coral-strong dark:text-tm-coral")}
              onClick={onToggleWatch}
              disabled={watchPending || watching}
              aria-pressed={watching}
            >
              <BookmarkSimple weight={watching ? "fill" : "regular"} className="size-4" aria-hidden />
              {watching ? "Watching this price" : "Watch the price instead"}
            </Button>
          )}
        </div>

        {pricing && extractionId && !needsSourcing && (
          <ReportPriceLink extractionId={extractionId} currencySymbol={currencySymbol} className="self-center" />
        )}
      </div>
    </section>
  );
}

/** The add-to-bag label for the state the line is in. Shared with `QuoteActionBar`. */
export function ctaLabel({ continuePending, checking, unavailable }: { continuePending: boolean; checking: boolean; unavailable: boolean }): string {
  if (continuePending) return "Adding to your bag";
  if (checking) return "Checking freight";
  if (unavailable) return "No longer available";
  return "Add to bag";
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
      className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** "$14.20" in the listing currency, "Free" for a free service. Display only: the server priced it. */
function formatOptionCost(option: StoreShippingOption): string {
  if (option.cost <= 0) return "Free";
  const symbol = option.currency === "USD" ? "$" : option.currency === "GBP" ? "£" : option.currency === "EUR" ? "€" : `${option.currency} `;
  return `${symbol}${option.cost.toFixed(2)}`;
}

/**
 * The store's shipping services to our hub, one of which is priced. A radio
 * group: the choice is a code the server resolves against its own snapshot,
 * so nothing here is money the browser could set.
 */
function ShippingOptionPicker({
  options,
  selectedCode,
  disabled,
  onChange,
}: {
  options: StoreShippingOption[];
  selectedCode: string;
  disabled: boolean;
  onChange: (code: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm leading-none font-semibold text-foreground">Store shipping to our hub</legend>
      {options.map((option) => {
        const selected = option.code === selectedCode;
        const eta = option.eta_min && option.eta_max ? formatEtaRange(option.eta_min, option.eta_max) : null;
        return (
          <label
            key={option.code}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-3.5 py-2.5 text-[13px] leading-none transition-colors",
              selected ? "border-tm-coral bg-tm-coral/5" : "border-border hover:border-muted-foreground/40",
              disabled && "cursor-default opacity-70",
            )}
          >
            <span className="flex items-center gap-2.5">
              <input
                type="radio"
                name="store-shipping-option"
                value={option.code}
                checked={selected}
                onChange={() => onChange(option.code)}
                className="size-4 accent-tm-coral"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold text-foreground">{option.label}</span>
                {eta && <span className="text-[11px] text-muted-foreground">at our hub {eta}</span>}
              </span>
            </span>
            <span className={cn("tm-nums font-semibold", option.cost <= 0 ? "text-tm-green" : "text-foreground")}>{formatOptionCost(option)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
