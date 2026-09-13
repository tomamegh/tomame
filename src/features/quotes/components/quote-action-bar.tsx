"use client";

import Link from "next/link";
import { ArrowRight, BookmarkSimple, Plus, Tote } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export interface QuoteActionBarProps {
  /** False while the line has no server price — there is nothing to pay for. */
  canContinue: boolean;
  continuePending: boolean;
  /** True while a quantity change is being re-priced by the server. */
  repricing: boolean;
  onContinue: () => void;
  /** Bag count once THIS screen added the line; the CTA then hands off to the bag. */
  addedCount: number | null;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
}

/**
 * The 390px sticky action bar.
 *
 * Below `lg` the receipt's own two buttons are hidden and these take their
 * place, so the price is always one thumb-reach from the thing that acts on it.
 * `fixed` rather than `sticky`: the bar must hold the bottom edge regardless of
 * how tall the page's own scroll container ends up, and the spacer the caller
 * reserves keeps the content clear of it.
 *
 * The CTA is the artboard's "Add to bag" (`ph-bold ph-tote`, line 411). Once
 * the line is in the bag it becomes a link to the bag, so a second tap cannot
 * add the product twice. No shadow at this width, per the artboard.
 */
export function QuoteActionBar({
  canContinue,
  continuePending,
  repricing,
  onContinue,
  addedCount,
  watching,
  watchPending,
  onToggleWatch,
}: QuoteActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-tm-border bg-card px-5 pt-3 lg:hidden",
        // 30px in the artboard is the home-indicator inset; on a device with a
        // real one, clear that instead.
        "pb-[max(30px,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleWatch}
          // Disabled once watching: there is no unwatch endpoint yet, so a
          // still-live button would do nothing when pressed.
          disabled={watchPending || watching}
          aria-pressed={watching}
          aria-label={watching ? "Watching this price" : "Watch this price"}
          className={cn(
            "flex size-[52px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] bg-card",
            "transition-colors focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            watching ? "border-tm-coral text-tm-coral" : "border-tm-border",
          )}
        >
          <BookmarkSimple
            weight={watching ? "fill" : "regular"}
            className="size-5"
            aria-hidden
          />
        </button>

        {addedCount != null ? (
          <>
            {/*
              The line is in the bag; the two things a customer does next are
              add the NEXT item or go and pay. Both are offered — "explicit load
              more products after adding to cart" was Kelvin's ask, and a bag is
              for several things bought the same week.
            */}
            <Link
              href="/app/orders/new"
              className={cn(
                "flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-tm-border bg-card text-[14px] leading-none font-semibold",
                "transition-colors hover:bg-tm-tint",
                "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
            >
              <Plus weight="bold" className="size-4" aria-hidden />
              Add another
            </Link>
            <Link
              href="/app/bag"
              className={cn(
                "tm-cta-gradient flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold",
                "transition-[filter,opacity] hover:brightness-105",
                "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
            >
              <Tote weight="bold" className="size-[18px]" aria-hidden />
              View bag · {addedCount}
              <ArrowRight weight="bold" className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue || continuePending || repricing}
            className={cn(
              "tm-cta-gradient flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold",
              "transition-[filter,opacity] hover:brightness-105",
              "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <Tote weight="bold" className="size-[18px]" aria-hidden />
            {continuePending ? "Adding to your bag…" : "Add to bag"}
          </button>
        )}
      </div>
    </div>
  );
}
