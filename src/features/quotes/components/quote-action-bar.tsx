"use client";

import { BookmarkSimple, Tote } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export interface QuoteActionBarProps {
  /** False while the line has no server price — there is nothing to pay for. */
  canContinue: boolean;
  continuePending: boolean;
  /** True while a quantity change is being re-priced by the server. */
  repricing: boolean;
  onContinue: () => void;
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
 * The CTA says "Continue to payment", not the artboard's "Add to bag" — there
 * is no bag until Phase 4, and a button that names one would be inventing a
 * flow. No shadow at this width, per the artboard.
 */
export function QuoteActionBar({
  canContinue,
  continuePending,
  repricing,
  onContinue,
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
          {continuePending ? "Creating your order…" : "Continue to payment"}
        </button>
      </div>
    </div>
  );
}
