import { AirplaneTilt } from "@phosphor-icons/react/ssr";

import type { JourneyStopCount } from "../types";
import { stopIcon } from "./stage-visuals";

export interface JourneyStopRailProps {
  stops: JourneyStopCount[];
}

/**
 * "Where things are" — the five-dot census (`v2-journeys`, design line 288).
 *
 * A count next to a dot is how many parcels STAND there right now, not how many
 * have ever passed it; see `countStops` in `journeys.service.ts`. A stop with
 * none gets no badge at all, which is the mock's own behaviour (`sc-if` on
 * `s.n`) — and it means an empty rail says "nothing is anywhere" rather than
 * printing five zeroes.
 *
 * Animation is the mock's literal timing: the card enters on `tmUp .5s .08s`,
 * each badge pops on `tmPop .5s .8s`, and the plane crosses on
 * `tmPlane 9s linear infinite`.
 */
export function JourneyStopRail({ stops }: JourneyStopRailProps) {
  const total = stops.reduce((sum, stop) => sum + stop.count, 0);

  return (
    <section
      aria-label="Where things are"
      className="tm-up grid items-center gap-5 rounded-[24px] border border-tm-border bg-card px-[22px] py-[22px] [animation-delay:0.08s] [animation-duration:0.5s] lg:grid-cols-[200px_1fr] lg:px-7"
    >
      <span className="text-xs leading-none font-semibold text-tm-text-3">
        Where things are
      </span>

      <div className="relative h-14">
        {/* The rail itself, behind the dots. */}
        <span
          aria-hidden
          className="absolute top-[27px] right-0 left-0 h-0.5 bg-[#EFE4DC]"
        />

        <ul className="absolute inset-0 grid grid-cols-5">
          {stops.map((stop) => {
            const Glyph = stopIcon(stop.key);
            return (
              <li
                key={stop.key}
                className="relative flex flex-col items-center gap-1.5"
              >
                <span className="relative z-[1] flex size-7 items-center justify-center rounded-full border-2 border-[#EFE4DC] bg-card text-tm-text-3">
                  <Glyph weight="duotone" className="size-3.5" aria-hidden />
                  {stop.count > 0 && (
                    <span
                      className="tm-pop absolute -top-2 -right-2 min-w-[18px] rounded-[9px] bg-tm-coral px-1 text-center text-[11px] leading-[18px] font-bold text-white [animation-delay:0.8s]"
                      // The count is already in the list item's accessible name
                      // below; announcing it twice reads as "Paid 2 2".
                      aria-hidden
                    >
                      {stop.count}
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-none font-medium text-tm-text-3">
                  {stop.label}
                </span>
                <span className="sr-only">{`${stop.count} at ${stop.label}`}</span>
              </li>
            );
          })}
        </ul>

        {/*
          The plane is decoration, and it only flies when something is actually
          moving: an empty rail with a plane crossing it every nine seconds
          suggests activity the account does not have.
        */}
        {total > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-2 left-0 h-0 w-full"
          >
            <span className="tm-plane absolute top-0 -ml-2 text-tm-coral [animation-duration:9s]">
              <AirplaneTilt weight="fill" className="size-4" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
