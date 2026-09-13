import { CircleNotch } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

export interface ReadingIndicatorProps {
  /** "amazon.com" — the one thing the customer recognises before a title exists. */
  host: string;
  /** The phase's headline — "Reading this page…", "Taking longer than usual". */
  title: string;
  /** The phase's second line, or null. */
  detail: string | null;
  /** Seconds since the paste was queued, or null when the clock is not yet running. */
  elapsedSeconds: number | null;
  /** Amber once the wait has become a problem; the bar keeps moving either way. */
  tone?: "neutral" | "amber";
  className?: string;
}

/**
 * The visible fact that a link is being read.
 *
 * A single spinning glyph beside a line of 13px text was the whole animation
 * before, and on a busy list it read as static. This is three things that
 * move or change: the spinner, a sweeping bar, and the elapsed count — none of
 * them a percentage, because a race across vendors has no known length and a
 * bar that fills would be a promise about timing nothing here can keep.
 *
 * `aria-live="polite"` on the copy, so a screen reader hears the phase change
 * at 5 s and 20 s without being told about every tick of the counter, which is
 * `aria-hidden`.
 */
export function ReadingIndicator({ host, title, detail, elapsedSeconds, tone = "neutral", className }: ReadingIndicatorProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <CircleNotch className="size-4 shrink-0 animate-spin text-tm-coral" aria-hidden />
          <span className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink">{host}</span>
        </span>
        {elapsedSeconds != null && (
          <span aria-hidden className="tm-nums shrink-0 text-xs leading-none font-medium text-tm-text-3">
            {elapsedSeconds}s
          </span>
        )}
      </div>

      <span
        role="progressbar"
        aria-label={`Reading ${host}`}
        className="relative block h-1 w-full overflow-hidden rounded-full bg-tm-tint"
      >
        <span
          aria-hidden
          className={cn(
            "tm-sweep absolute inset-y-0 left-0 w-1/4 rounded-full",
            tone === "amber" ? "bg-tm-amber" : "bg-[image:var(--tm-gradient)]",
          )}
        />
      </span>

      <div aria-live="polite" className="flex flex-col gap-1">
        <span
          className={cn(
            "text-[13px] leading-none font-medium",
            tone === "amber" ? "text-tm-amber" : "text-tm-text-2",
          )}
        >
          {title}
        </span>
        {detail && <span className="text-xs leading-[1.45] text-tm-text-3">{detail}</span>}
      </div>
    </div>
  );
}
