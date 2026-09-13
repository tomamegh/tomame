"use client";

import Link from "next/link";
import { ArrowRight, LockSimple } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";

export interface BagPayBarProps {
  /** The amount the button charges, GHS. Omitted for the empty bag, which has nothing to pay. */
  totalGhs: number | null;
  /** Button label prefix: "Pay" for the open bag, "Finish paying" for an unpaid group. */
  verb: "pay" | "finish";
  busy: boolean;
  disabled: boolean;
  onPay: () => void;
  /** "23h 12m", or null when nothing is locked. Shown above the button, never computed here. */
  countdown: string | null;
}

const BUTTON = cn(
  "tm-cta-gradient flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
  "transition-[filter,opacity] hover:brightness-105",
  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/**
 * The 390px bag action bar.
 *
 * `v2-bag` has no phone artboard; the approved reading is the desktop screen
 * rendered responsively with the DETAIL phone's bottom-bar pattern (artboard
 * line 411): `padding: 12px 20px 30px`, 52px controls, no shadow. Below `lg`
 * the rail's own pay button stands down and this takes its place, so the
 * amount is always one thumb-reach from the thing that charges it.
 *
 * `fixed`, not `sticky`: the bar must hold the bottom edge whatever height the
 * boxes give the page. `BagView` reserves the 95px it covers. `/app/bag` is in
 * `MOBILE_ACTION_BAR_ROUTES`, so the tab bar stands down here — which is why
 * the empty bag renders this bar too (see `BagPasteLinkBar`): a phone must not
 * be left with no bottom bar at all.
 *
 * The lock countdown rides above the button because it is the one number that
 * expires while the customer is deciding.
 */
export function BagPayBar({
  totalGhs,
  verb,
  busy,
  disabled,
  onPay,
  countdown,
}: BagPayBarProps) {
  return (
    <BarShell>
      {countdown && (
        <p className="tm-nums flex items-center justify-center gap-1 pb-2 text-xs leading-none font-medium text-tm-text-3">
          <LockSimple className="size-3 shrink-0" aria-hidden />
          rate locked {countdown}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onPay}
          disabled={disabled || busy}
          aria-busy={busy}
          className={BUTTON}
        >
          {busy ? (
            "Redirecting to Paystack…"
          ) : (
            <>
              {verb === "finish" ? "Finish paying" : "Pay"}{" "}
              {totalGhs != null && formatGhs(totalGhs)}
              <ArrowRight weight="bold" className="size-4" aria-hidden />
            </>
          )}
        </button>
      </div>
    </BarShell>
  );
}

/**
 * What the bar shows when there is nothing to pay for: the same action the
 * empty-bag card offers, in the thumb position. The card's own button is
 * hidden below `lg` so the screen has one primary action, not two.
 */
export function BagPasteLinkBar() {
  return (
    <BarShell>
      <div className="flex items-center gap-2.5">
        <Link href="/app/orders/new" className={BUTTON}>
          Paste a link
          <ArrowRight weight="bold" className="size-4" aria-hidden />
        </Link>
      </div>
    </BarShell>
  );
}

/** The shared frame: the artboard's `12px 20px 30px`, with the home-indicator inset as the floor. */
function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-tm-border bg-card px-5 pt-3 lg:hidden",
        // 30px in the artboard is the home-indicator inset; on a device with a
        // real one, clear that instead.
        "pb-[max(30px,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto w-full max-w-[1280px]">{children}</div>
    </div>
  );
}
