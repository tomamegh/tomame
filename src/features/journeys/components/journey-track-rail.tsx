import type { JourneyTrack } from "@/features/orders/services/journey-track";
import { formatEtaWindow, formatShortDay } from "../format";
import type { JourneyEta } from "../types";
import { stopIcon } from "./stage-visuals";

export interface JourneyTrackRailProps {
  track: JourneyTrack;
  /** The window the final stop prints, when one exists. */
  eta: JourneyEta | null;
}

/**
 * The five-stop stage track (`v2-detail`, design lines 340–346).
 *
 * Rendered over the SEVEN real statuses plus `order_events` — there is no
 * "US hub" status and none was added; see `journey-track.ts`. Each stop shows a
 * sub-line only when a stored row supports one, so a parcel whose hub arrival
 * nobody logged shows the stop with no date rather than a plausible date.
 *
 * The mock's literal delays: the green fill is
 * `tmFill 1.4s .3s cubic-bezier(.16,1,.3,1)` and the five dots pop on
 * `tmPop .5s` at `.3s .5s .7s 1s 1.2s`.
 */
const STOP_DELAYS = ["0.3s", "0.5s", "0.7s", "1s", "1.2s"] as const;

export function JourneyTrackRail({ track, eta }: JourneyTrackRailProps) {
  return (
    <div className="relative px-0 pt-2 pb-1">
      {/* The rail. Inset 16px each side so it starts and ends under a dot. */}
      <span
        aria-hidden
        className="absolute top-[23px] right-4 left-4 h-[3px] rounded-sm bg-[#EFE4DC]"
      />
      <span
        aria-hidden
        data-testid="journey-track-fill"
        className="absolute top-[23px] left-4 h-[3px] origin-left rounded-sm bg-tm-green [animation:tmFill_1.4s_.3s_cubic-bezier(.16,1,.3,1)_both]"
        // The fill stops at the parcel's stop. `calc` accounts for the 16px
        // inset at both ends, so 100% lands on the last dot, not past it.
        style={{ width: `calc((100% - 2rem) * ${track.percent / 100})` }}
      />

      <ol className="relative grid grid-cols-5">
        {track.stops.map((stop, index) => {
          const Glyph = stopIcon(stop.key);
          const isFinal = stop.key === "your_door";
          // The last stop prints the delivery window while it is still ahead,
          // and the delivery date once it has happened.
          const sub =
            isFinal && stop.state !== "done"
              ? etaLine(eta)
              : [formatShortDay(stop.at), stop.note]
                  .filter((part): part is string => !!part)
                  .join(" · ") || null;

          return (
            <li key={stop.key} className="flex flex-col items-start gap-3">
              <span
                className={`tm-pop flex size-[34px] items-center justify-center rounded-full border-2 ${dotClasses(stop.state)}`}
                style={{ animationDelay: STOP_DELAYS[index] }}
              >
                <Glyph weight="fill" className="size-[15px]" aria-hidden />
              </span>
              <div className="flex flex-col gap-[3px] pr-3">
                <p
                  className={`text-[13px] leading-[1.2] font-semibold ${
                    stop.state === "up" ? "text-tm-text-3" : "text-tm-ink"
                  }`}
                >
                  {stop.label}
                </p>
                {sub && (
                  <p className="text-xs leading-[1.4] font-normal text-tm-text-3">
                    {sub}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * "Est. Thu 18 – Sat 20 Sep". The word "Est." is only dropped once an operator
 * has confirmed the window: a forecast from the region's transit band must not
 * read as a promise.
 */
function etaLine(eta: JourneyEta | null): string | null {
  const window = formatEtaWindow(eta);
  if (!window || !eta) return null;
  return eta.source === "confirmed" ? window : `Est. ${window}`;
}

/** Done is green, the current stop is coral, everything ahead is an empty outline. */
function dotClasses(state: "done" | "now" | "up"): string {
  switch (state) {
    case "done":
      return "border-tm-green bg-tm-green text-white";
    case "now":
      return "border-tm-coral bg-tm-coral text-white";
    case "up":
      return "border-[#EFE4DC] bg-card text-[#C9BDB5]";
  }
}
