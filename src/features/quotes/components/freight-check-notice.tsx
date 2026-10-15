"use client";

import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/** Past this the copy admits the check is slow; the bar keeps moving either way. */
export const FREIGHT_CHECK_SLOW_AFTER_MS = 12_000;

export interface FreightCheckNoticeProps {
  /**
   * When this screen first saw the check running, in the browser's clock. Not
   * the server's start time: a phone whose clock is a minute out would
   * otherwise open straight onto "taking longer".
   */
  seenAt: number;
  className?: string;
}

/**
 * The receipt's "we are checking the freight" state.
 *
 * The total above it is the calculator's price with the weight it had; a
 * background check is looking the item's real shipping weight up and may move
 * the freight. Until it answers the customer cannot add the line to the bag,
 * so this says what is happening and that it is short — and, once it is not
 * short, says that too rather than spinning silently.
 */
export function FreightCheckNotice({ seenAt, className }: FreightCheckNoticeProps) {
  const [now, setNow] = useState(seenAt);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - seenAt) / 1_000));
  const slow = now - seenAt >= FREIGHT_CHECK_SLOW_AFTER_MS;

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-[14px] bg-tm-tint px-3.5 py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2">
          <CircleNotch className="mt-px size-4 shrink-0 animate-spin text-tm-coral" aria-hidden />
          <span role="status" aria-live="polite" className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] leading-[1.3] font-semibold text-tm-ink">
              {slow ? "Still checking the freight" : "Checking the freight weight"}
            </span>
            <span className="text-[12px] leading-[1.45] font-medium text-tm-text-2">
              {slow
                ? "This one is taking a little longer than usual. You can add it to your bag the moment it is done."
                : "We are looking up this item's shipping weight so the freight is right. It takes a few seconds."}
            </span>
          </span>
        </span>
        <span aria-hidden className="tm-nums shrink-0 text-xs leading-none font-medium text-tm-text-3">
          {elapsed}s
        </span>
      </div>
      <span
        role="progressbar"
        aria-label="Checking the freight weight"
        className="relative block h-1 w-full overflow-hidden rounded-full bg-card"
      >
        <span
          aria-hidden
          className={cn(
            "tm-sweep absolute inset-y-0 left-0 w-1/4 rounded-full",
            slow ? "bg-tm-amber" : "bg-[image:var(--tm-gradient)]",
          )}
        />
      </span>
    </div>
  );
}
