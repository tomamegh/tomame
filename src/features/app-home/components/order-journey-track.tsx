import type { JourneyTrack, TrackStop } from "@/features/orders/services/journey-track";
import { formatEtaWindow, formatShortDay } from "@/features/journeys/format";
import type { JourneyEta } from "@/features/journeys/types";
import { stopIcon } from "@/features/journeys/components/stage-visuals";
import { cn } from "@/lib/utils";

export interface OrderJourneyTrackProps {
  track: JourneyTrack;
  /** The window the last stop prints while it is still ahead. Null when none is set. */
  eta: JourneyEta | null;
  className?: string;
}

/** The mock's pop cadence for the five dots, shared with the order detail's rail. */
const STOP_DELAYS = ["0.3s", "0.45s", "0.6s", "0.75s", "0.9s"] as const;

/**
 * One order's five-stop journey, compact enough for a Home card.
 *
 * The same `JourneyTrack` the order detail draws — stops, states and dates all
 * come from `deriveJourneyTrack` over `orders.status` and `order_events` — so
 * this is a smaller picture of that journey, never a second opinion of it.
 *
 * Each stop is a grid column with its dot centred, so the rail runs from the
 * first column's centre (10%) to the last one's (90%) and the fill ends on a
 * dot. Below `sm` the labels and dates are visually hidden but stay in the
 * accessibility tree: five labels in a ~280px phone card run into each other,
 * and the stage word already sits in the card's badge.
 */
export function OrderJourneyTrack({ track, eta, className }: OrderJourneyTrackProps) {
  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className="absolute top-[10px] right-[10%] left-[10%] h-0.5 rounded-sm bg-[#EFE4DC] sm:top-[11px]"
      />
      <span
        aria-hidden
        className={cn(
          "tm-fill absolute top-[10px] left-[10%] h-0.5 rounded-sm [animation-delay:0.3s] [animation-duration:1.2s] sm:top-[11px]",
          track.isCancelled ? "bg-[#C9BDB5]" : "bg-tm-green",
        )}
        style={{ width: `${(track.percent / 100) * 80}%` }}
      />

      <ol aria-label="Order journey" className="relative grid grid-cols-5">
        {track.stops.map((stop, index) => {
          const Glyph = stopIcon(stop.key);
          const sub = subLine(stop, eta);
          return (
            <li key={stop.key} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <span
                aria-hidden
                className={cn(
                  "tm-pop flex size-5 items-center justify-center rounded-full border-2 sm:size-[22px]",
                  dotClasses(stop.state),
                )}
                style={{ animationDelay: STOP_DELAYS[index] }}
              >
                <Glyph weight="fill" className="size-2.5 sm:size-[11px]" />
              </span>
              <span className="sr-only flex flex-col gap-[3px] sm:not-sr-only">
                <span
                  className={cn(
                    "text-[11px] leading-[1.2] font-semibold",
                    stop.state === "up" ? "text-tm-text-3" : "text-tm-ink",
                  )}
                >
                  {stop.label}
                  <span className="sr-only">, {STATE_WORDS[stop.state]}</span>
                </span>
                {sub && (
                  <span className="text-[11px] leading-[1.2] font-medium text-tm-text-3">
                    {sub}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const STATE_WORDS: Record<TrackStop["state"], string> = {
  done: "done",
  now: "current stop",
  up: "still ahead",
};

/**
 * The date a stop prints. A reached stop prints when it was reached; the last
 * stop, while still ahead, prints the delivery window — with "Est." unless an
 * operator confirmed it. A stop with nothing recorded prints nothing.
 */
function subLine(stop: TrackStop, eta: JourneyEta | null): string | null {
  if (stop.key === "your_door" && stop.state !== "done") {
    const window = formatEtaWindow(eta);
    if (!window || !eta) return null;
    return eta.source === "confirmed" ? window : `Est. ${window}`;
  }
  return formatShortDay(stop.at);
}

/** Done is green, the current stop is coral, everything ahead is an outline. */
function dotClasses(state: TrackStop["state"]): string {
  switch (state) {
    case "done":
      return "border-tm-green bg-tm-green text-white";
    case "now":
      return "border-tm-coral bg-tm-coral text-white";
    case "up":
      return "border-[#EFE4DC] bg-card text-[#C9BDB5]";
  }
}
