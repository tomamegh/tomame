"use client";

import { LockSimple } from "@phosphor-icons/react/ssr";

import { NumberRoll } from "@/components/motion/number-roll";
import { cn } from "@/lib/utils";

export interface PriceDisplayProps {
  /** The landed total, already formatted by the server's formatter ("GH₵5,041.16"). Display only. */
  amount: string;
  /** The line above the figure. */
  overline?: string;
  /** "≈ $349.36": the server's USD echo, never computed here. */
  usd?: string | null;
  /** "Rate 15.42 locked until 4:30 pm". */
  lock?: string | null;
  /** The figure may still move (a freight check is running): dimmed, not hidden. */
  provisional?: boolean;
  size?: "md" | "lg";
  /** Roll the digits in on first render. Off for a figure that was already on screen. */
  roll?: boolean;
  className?: string;
}

/** "GH₵5,041" + ".16": the pence are set smaller so the cedis read first. */
function split(amount: string): { whole: string; fraction: string } {
  const dot = amount.lastIndexOf(".");
  return dot === -1 ? { whole: amount, fraction: "" } : { whole: amount.slice(0, dot), fraction: amount.slice(dot) };
}

/**
 * The landed price, shown one way everywhere: overline, the GH₵ total with
 * the pence set back, the dollar echo, and the rate lock. Nothing here does
 * arithmetic; every string arrives formatted from the server's breakdown.
 */
export function PriceDisplay({
  amount,
  overline = "Landed in Accra",
  usd = null,
  lock = null,
  provisional = false,
  size = "md",
  roll = true,
  className,
}: PriceDisplayProps) {
  const { whole, fraction } = split(amount);
  const large = size === "lg";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {overline && <span className="tm-overline text-tm-coral-strong dark:text-tm-coral">{overline}</span>}
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 transition-opacity duration-200",
          provisional && "opacity-55",
        )}
      >
        <p
          className={cn(
            "leading-none font-bold tracking-[-0.03em] text-foreground",
            large ? "text-[34px] lg:text-[42px]" : "text-[28px] lg:text-[32px]",
          )}
        >
          <NumberRoll value={whole} rollOnMount={roll} />
          {fraction && (
            <NumberRoll
              value={fraction}
              rollOnMount={roll}
              className={cn("text-muted-foreground", large ? "text-[22px] lg:text-[26px]" : "text-[19px] lg:text-[21px]")}
            />
          )}
        </p>
        {usd && <span className="tm-nums text-sm leading-none font-medium text-muted-foreground">{usd}</span>}
      </div>
      {lock && (
        <span className="tm-nums flex items-center gap-1.5 text-[12.5px] leading-[1.3] font-medium text-muted-foreground">
          <LockSimple className="size-3.5 shrink-0" aria-hidden />
          {lock}
        </span>
      )}
    </div>
  );
}
