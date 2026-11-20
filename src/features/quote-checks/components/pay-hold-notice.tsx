"use client";

import { ArrowSquareOut, SealCheck, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { InlineStatus } from "@/components/ui/inline-status";
import type { PayHold } from "@/features/extraction/pay-gate";
import type { StockCheckView } from "@/features/extraction/types";
import { cn } from "@/lib/utils";
import { holdCopy, stockConfirmedLine, stockReasons } from "../hold-copy";
import { openStockCheck, useStockCheckView } from "../hooks/useQuoteTrust";

export interface PayHoldNoticeProps {
  hold: PayHold | null;
  /** The quote's stock check view, when the screen already has it (the quote). */
  stockCheck?: StockCheckView | null;
  /** Needed to open a stock check and to fetch its WhatsApp link on the bag. */
  extractionId: string | null;
  /** Bag line: smaller, and the stock check's WhatsApp link is fetched lazily. */
  compact?: boolean;
  className?: string;
}

const WHATSAPP_LINK = cn(
  "inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-border bg-card px-3.5 text-[13px] leading-none font-semibold text-foreground",
  "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none",
);

/**
 * Why this item cannot be paid for yet, and what happens next (pay-gate.ts).
 *
 * The freight check has its own notice with a progress bar on the quote; this
 * covers it only on the compact bag line. A stock check offers "Confirm on
 * WhatsApp" with the item and quote reference typed in (the API's wa.me link);
 * a confirmed stock check with no other hold shows a quiet success line.
 */
export function PayHoldNotice({ hold, stockCheck = null, extractionId, compact = false, className }: PayHoldNoticeProps) {
  const needsStockView = compact && hold?.kind === "stock_check" && stockCheck == null;
  const fetched = useStockCheckView(extractionId, needsStockView);
  const stock = stockCheck ?? fetched.data ?? null;

  if (!hold) {
    const confirmed = stockConfirmedLine(stock);
    if (!confirmed || compact) return null;
    return (
      <InlineStatus tone="success" icon={SealCheck} title={confirmed} className={className}>
        {stockReasons(stock)}
      </InlineStatus>
    );
  }
  if (hold.kind === "freight_check" && !compact) return null;

  const copy = holdCopy(hold, stock);
  const reasons = hold.kind === "stock_check" ? stockReasons(stock) : null;
  const whatsapp = hold.kind === "stock_check" ? stock?.whatsapp_url ?? null : null;

  const action =
    whatsapp ? (
      <a
        href={whatsapp}
        target="_blank"
        rel="noreferrer"
        className={WHATSAPP_LINK}
        onClick={() => {
          // Staff hear about it even if the message is never sent.
          if (extractionId && stock?.status === "needed") openStockCheck(extractionId);
        }}
      >
        <WhatsappLogo weight="fill" className="size-[18px] text-[#25D366]" aria-hidden />
        Confirm on WhatsApp
      </a>
    ) : hold.kind === "unavailable" && hold.substitute_url ? (
      <a href={hold.substitute_url} target="_blank" rel="noreferrer" className={WHATSAPP_LINK}>
        See the alternative
        <ArrowSquareOut className="size-4" aria-hidden />
      </a>
    ) : null;

  return (
    <InlineStatus
      tone={copy.tone}
      title={copy.title}
      action={action}
      className={cn(compact && "px-3 py-2.5", className)}
    >
      {reasons && <span className="block font-medium text-foreground/80">{reasons}</span>}
      {!compact && <span className="block">{copy.detail}</span>}
      {compact && hold.kind !== "stock_check" && <span className="block">{copy.detail}</span>}
      {stock?.reference && hold.kind === "stock_check" && !compact && (
        <span className="tm-nums mt-0.5 block text-[12px]">Quote reference {stock.reference}</span>
      )}
    </InlineStatus>
  );
}
