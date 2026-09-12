import Image from "next/image";
import type { Icon } from "@phosphor-icons/react";
import {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  HandHeart,
  LinkSimple,
  Receipt,
  Tag,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { HomeReceipt } from "../types";
import {
  buildReceiptRows,
  formatRelativeTime,
  PLACEHOLDER_THUMB_CLASS,
  RECEIPT_ROW_DELAYS,
  safeImageSrc,
  splitGhsTotal,
  type ReceiptRowIcon,
} from "./format";

/** One duotone glyph per receipt line, keyed by the row the builder emitted. */
const ROW_ICONS: Record<ReceiptRowIcon, Icon> = {
  item: Tag,
  tax: Bank,
  fee: HandHeart,
  freight: AirplaneTilt,
  rate: ArrowsLeftRight,
};

export interface LiveReceiptCardProps {
  /** Null when the customer has pasted nothing yet — a real, common state. */
  receipt: HomeReceipt | null;
  /** Passed in, never read from the clock here, so SSR and hydration agree. */
  now: Date;
  className?: string;
}

/**
 * "Live receipt · last link you pasted".
 *
 * Every figure comes from the server-priced `PricingBreakdown` on the receipt;
 * this component formats and never calculates. Three states are all first-class:
 * nothing pasted, pasted but unpriceable, and priced.
 *
 * There is no "Add to bag" button. There is no bag yet (Phase 4), and a button
 * that cannot do anything is worse than no button.
 */
export function LiveReceiptCard({
  receipt,
  now,
  className,
}: LiveReceiptCardProps) {
  return (
    <section
      aria-labelledby="live-receipt-heading"
      className={cn(
        "tm-up flex min-w-0 flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px]",
        "[animation-delay:0.12s]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          id="live-receipt-heading"
          className="font-display text-[17px] leading-none font-bold"
        >
          Live receipt
        </h2>
        <span className="text-xs leading-none font-medium text-tm-text-3">
          last link you pasted
        </span>
      </header>

      {receipt ? (
        <ReceiptBody receipt={receipt} now={now} />
      ) : (
        <EmptyReceipt />
      )}
    </section>
  );
}

function ReceiptBody({ receipt, now }: { receipt: HomeReceipt; now: Date }) {
  const rows = receipt.pricing ? buildReceiptRows(receipt.pricing) : [];
  // Guarded exactly like the rows above it. Without this a non-finite total
  // prints "GH₵NaN" as the largest figure on the card, which is worse than
  // showing no total at all beside an honest "we could not read a price".
  const total =
    receipt.pricing && Number.isFinite(receipt.pricing.total_ghs)
      ? splitGhsTotal(receipt.pricing.total_ghs)
      : null;

  return (
    <>
      <ProductStrip receipt={receipt} now={now} />

      {rows.length > 0 ? (
        <dl className="tm-nums flex flex-col gap-2 text-[13px] leading-none font-medium text-tm-text-2">
          {rows.map((row, index) => {
            const RowIcon = ROW_ICONS[row.icon];
            return (
              <div
                key={row.key}
                className="tm-up flex items-center justify-between gap-3 [animation-duration:0.5s]"
                style={{ animationDelay: RECEIPT_ROW_DELAYS[index] ?? "0.85s" }}
              >
                <dt className="flex items-center gap-2">
                  <RowIcon
                    weight="duotone"
                    className="size-[15px] shrink-0 text-tm-coral"
                    aria-hidden
                  />
                  {row.label}
                </dt>
                <dd>{row.value}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="rounded-[14px] bg-tm-amber-bg px-3.5 py-3 text-[13px] leading-[1.45] font-medium text-tm-text-2">
          {receipt.pricingUnavailableReason ??
            "We could not read a price for this link yet."}
        </p>
      )}

      {total && (
        <div className="tm-pop flex items-baseline justify-between gap-3 border-t border-dashed border-[#E8DDD6] pt-3 [animation-delay:1.1s]">
          <span className="text-sm leading-none font-semibold">
            Landed in Accra
          </span>
          <span className="tm-nums text-[26px] leading-none font-bold tracking-[-0.02em]">
            {total.whole}
            {total.fraction && (
              <span className="text-base text-tm-text-3">{total.fraction}</span>
            )}
          </span>
        </div>
      )}
    </>
  );
}

function ProductStrip({ receipt, now }: { receipt: HomeReceipt; now: Date }) {
  const image = safeImageSrc(receipt.productImageUrl);
  const pasted = formatRelativeTime(receipt.pastedAt, now);
  const meta = [receipt.storeHost, pasted].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-[var(--tm-pill-bg)] p-3">
      {image ? (
        <Image
          src={image}
          alt=""
          width={52}
          height={52}
          className="size-[52px] shrink-0 rounded-[10px] object-cover"
        />
      ) : (
        <div
          className={cn(
            "size-[52px] shrink-0 rounded-[10px]",
            PLACEHOLDER_THUMB_CLASS,
          )}
          aria-hidden
        />
      )}
      <div className="min-w-0">
        <p className="truncate text-[13px] leading-[1.3] font-semibold">
          {receipt.productName ?? receipt.productUrl}
        </p>
        {meta && (
          <p className="mt-[3px] text-xs leading-none font-medium text-tm-text-3">
            {meta}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The honest default for a new customer: no invented product, no sample price.
 * It explains what will appear here instead of pretending something already has.
 */
function EmptyReceipt() {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 rounded-[14px] bg-[var(--tm-pill-bg)] p-5">
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral">
        <Receipt weight="duotone" className="size-[22px]" aria-hidden />
      </span>
      <p className="text-sm leading-[1.45] font-semibold">
        No link pasted yet
      </p>
      <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
        Paste a product link above and the full landed price — item, tax, our
        fee, freight and today&apos;s rate — prints here in GH₵.
      </p>
      <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral">
        <LinkSimple weight="duotone" className="size-4" aria-hidden />
        Nothing is charged until you approve it
      </span>
    </div>
  );
}
