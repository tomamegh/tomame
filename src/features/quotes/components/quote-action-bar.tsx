"use client";

import Link from "next/link";
import { ArrowRight, BookmarkSimple, HandWaving, Plus, Tote } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import { ctaLabel } from "./quote-receipt-card";

export interface QuoteActionBarProps {
  /** Opens the checkout panel on this screen; without it the handoff is a link to /app/bag. */
  onPayNow?: () => void;
  /** False while the line has no server price — there is nothing to pay for. */
  canContinue: boolean;
  continuePending: boolean;
  /** True while a quantity change is being re-priced by the server. */
  repricing: boolean;
  /** True while the freight weight is being checked; the CTA waits for it. */
  freightChecking?: boolean;
  /** The store no longer has it (pay-gate `unavailable`): nothing to add. */
  unavailable?: boolean;
  /** One short line above the button while a price or stock check holds payment. */
  holdNote?: string | null;
  /** The server's landed total, repeated beside the action so the price stays in view. */
  totalGhs?: number | null;
  onContinue: () => void;
  /** Bag count once THIS screen added the line; the CTA then hands off to the bag. */
  addedCount: number | null;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  /** Nobody has confirmed we can buy this (065); the bar asks a person instead. */
  needsSourcing?: boolean;
  onAskToSource?: () => void;
  sourcePending?: boolean;
}

/**
 * The phone's sticky action bar: the price's one action within thumb reach,
 * pinned above the home indicator. Below `lg` the receipt's own buttons stand
 * down and these take their place; once the line is in the bag it hands off to
 * the bag so a second tap cannot add it twice.
 *
 * The safe-area padding is a literal class, never passed through `cn()`,
 * which drops `pb-[calc(…env…)]`-shaped arbitrary values.
 */
export function QuoteActionBar({
  canContinue,
  continuePending,
  repricing,
  freightChecking = false,
  unavailable = false,
  holdNote = null,
  totalGhs = null,
  onContinue,
  addedCount,
  onPayNow,
  watching,
  watchPending,
  onToggleWatch,
  needsSourcing = false,
  onAskToSource,
  sourcePending = false,
}: QuoteActionBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-[12px] lg:hidden">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2.5">
        {holdNote && addedCount == null && (
          <p role="status" className="tm-caption text-center font-medium text-muted-foreground">
            {holdNote}
          </p>
        )}
        <div className="flex items-center gap-2.5">
          {!needsSourcing && addedCount == null && (
            <Button
              variant="outline"
              size="icon-lg"
              onClick={onToggleWatch}
              disabled={watchPending || watching}
              aria-pressed={watching}
              aria-label={watching ? "Watching this price" : "Watch this price"}
              className={cn("size-[52px]", watching && "border-tm-coral text-tm-coral")}
            >
              <BookmarkSimple weight={watching ? "fill" : "regular"} className="size-5" aria-hidden />
            </Button>
          )}

          {addedCount != null ? (
            <>
              <Button asChild variant="outline" size="lg" className="flex-1 px-3 text-[14px] font-semibold">
                <Link href="/app/orders/new">
                  <Plus weight="bold" className="size-4" aria-hidden />
                  Add another
                </Link>
              </Button>
              {onPayNow ? (
                <Button variant="primary" size="lg" className="flex-1 px-3" onClick={onPayNow}>
                  <Tote weight="bold" className="size-[18px]" aria-hidden />
                  Pay now · {addedCount}
                  <ArrowRight weight="bold" className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button asChild variant="primary" size="lg" className="flex-1 px-3">
                  <Link href="/app/bag">
                    <Tote weight="bold" className="size-[18px]" aria-hidden />
                    View bag · {addedCount}
                    <ArrowRight weight="bold" className="size-4" aria-hidden />
                  </Link>
                </Button>
              )}
            </>
          ) : needsSourcing ? (
            <Button variant="primary" size="lg" className="flex-1" onClick={onAskToSource} loading={sourcePending}>
              {!sourcePending && <HandWaving weight="bold" className="size-[18px]" aria-hidden />}
              {sourcePending ? "Sending" : "Ask us to source this"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="min-w-0 flex-1 px-4"
              onClick={onContinue}
              loading={continuePending}
              disabled={!canContinue || repricing || freightChecking || unavailable}
            >
              {!continuePending && <Tote weight="bold" className="size-[18px]" aria-hidden />}
              <span className="truncate">{ctaLabel({ continuePending, checking: freightChecking, unavailable })}</span>
              {totalGhs != null && !continuePending && !freightChecking && !unavailable && (
                <span className="tm-nums shrink-0 font-semibold opacity-90">· {formatGhs(totalGhs)}</span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
