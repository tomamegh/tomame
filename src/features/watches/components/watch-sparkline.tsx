import { cn } from "@/lib/utils";
import type { WatchSparkline } from "../types";
import {
  clampBarHeight,
  directionBarClass,
  SPARKLINE_IDLE_BAR_CLASS,
} from "./format";

export interface WatchSparklineBarsProps {
  /** Already derived server-side from `price_usd`. `null` means no trend. */
  sparkline: WatchSparkline | null;
  /** Track height in px — 14 on the Home card, 18 at page scale. */
  height?: number;
  /** Bar width in px — 6 on the Home card, 7 at page scale. */
  barWidth?: number;
  className?: string;
}

/**
 * The price sparkline: bar heights as they arrived, oldest → newest.
 *
 * **Renders exactly what it is given.** The series carries at most six bars and
 * often fewer — a watch checked three times draws three — and it is never
 * padded out to six, because an invented point is an invented price. A `null`
 * sparkline (0 or 1 observations) renders nothing at all; the row's status line
 * says why.
 *
 * `aria-hidden`, deliberately: the same information is already in the delta
 * label beside it, and a screen reader announcing six percentages adds noise,
 * not meaning.
 */
export function WatchSparklineBars({
  sparkline,
  height = 14,
  barWidth = 6,
  className,
}: WatchSparklineBarsProps) {
  if (!sparkline || sparkline.bars.length === 0) return null;

  const { bars, direction } = sparkline;
  const lastIndex = bars.length - 1;

  return (
    <div
      aria-hidden
      className={cn("flex items-end gap-[2px]", className)}
      style={{ height }}
    >
      {bars.map((bar, index) => (
        <span
          key={index}
          className={cn(
            "rounded-[2px]",
            index === lastIndex
              ? directionBarClass(direction)
              : SPARKLINE_IDLE_BAR_CLASS,
          )}
          style={{ width: barWidth, height: `${clampBarHeight(bar)}%` }}
        />
      ))}
    </div>
  );
}
