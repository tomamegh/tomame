import Link from "next/link";
import { Package } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { formatGhs } from "@/features/marketing/format";
import { formatDepartureDay, formatLbs } from "@/features/bag/components/format";
import type { HomeFreightBox } from "../types";

export interface FreightBoxCardProps {
  /**
   * The open bag's first consolidation box, priced and packed server-side.
   * The Home page renders nothing when it is null — an empty bag has no box to
   * be a percentage of.
   */
  box: HomeFreightBox;
  /** Passed in, never read from the clock here, so SSR and hydration agree. */
  now: Date;
  className?: string;
}

const shortWeekday = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});

/**
 * "Ships Fri" — the mock's eyebrow, derived rather than written.
 *
 * A bare weekday only identifies a day inside the coming week, so a departure
 * further out prints the date too ("Ships Fri 26 Sep"); `formatDepartureDay`
 * owns that spelling so the eyebrow and the bag's box header cannot drift.
 * Returns null when there is no schedule, the timestamp is junk, or the box has
 * already flown — an eyebrow is dropped rather than guessed.
 */
function formatShipsOn(departsAt: string | null, now: Date): string | null {
  if (!departsAt) return null;
  const departs = new Date(departsAt);
  if (Number.isNaN(departs.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const daysAway = (departs.getTime() - now.getTime()) / 86_400_000;
  if (daysAway < 0) return null;
  if (daysAway < 7) return `Ships ${shortWeekday.format(departs)}`;

  const full = formatDepartureDay(departsAt);
  return full ? `Ships ${full}` : null;
}

/**
 * "Your freight box" — `v2-home` lines 118–129, Row B beside the journeys.
 *
 * A Server Component that formats and never calculates: the fill percentage,
 * the chargeable weight, the capacity and the marginal saving all arrive from
 * the bag service, so the crate on Home and the meter in the bag are the same
 * two numbers. Three of the mock's literals are refused here — the eyebrow is
 * derived from the real departure, the saving promise disappears when nothing
 * more fits, and an unweighed line makes the sub-line say the weight is still
 * to be confirmed rather than print a figure that is missing a line.
 *
 * The crate is `aria-hidden`: it draws the same percentage the footer states in
 * words, so announcing it twice would only add noise.
 */
export function FreightBoxCard({ box, now, className }: FreightBoxCardProps) {
  const ships = formatShipsOn(box.departsAt, now);

  // The crate's fill and the stated percentage read off one clamped value, so
  // a bad figure cannot draw a bar taller than the box it sits in.
  const fillPct = Number.isFinite(box.fillPct)
    ? Math.max(0, Math.min(100, Math.round(box.fillPct)))
    : 0;

  const itemLabel = `${box.itemCount} item${box.itemCount === 1 ? "" : "s"}`;
  // Same admission the bag's box footer makes, in the sub-line's shorter voice —
  // and with the same count, so a box of two weightless listings does not claim
  // that one of them is known.
  const weightLabel =
    box.unweighedLineCount > 0
      ? `${box.unweighedLineCount === 1 ? "one weight" : `${box.unweighedLineCount} weights`} still to be confirmed`
      : `${formatLbs(box.weightLbs)} of ${formatLbs(box.capacityLbs)}`;

  return (
    <Link
      href={box.href}
      aria-label={`${box.label}, ${fillPct}% full${ships ? `, ${ships.toLowerCase()}` : ""}. Open your bag.`}
      className={cn(
        "tm-up relative flex min-w-0 flex-col gap-3.5 overflow-hidden rounded-[24px]",
        "border border-[#F5E9E2] bg-[linear-gradient(160deg,#FFF1EC,#FFF7EA)] p-6",
        "[animation-duration:0.6s] [animation-delay:0.28s]",
        "transition-shadow hover:shadow-[0_10px_30px_rgba(196,62,34,0.09)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] leading-none font-bold">
          Your freight box
        </h2>
        {ships && (
          <span className="shrink-0 text-xs leading-none font-semibold text-tm-coral-strong">
            {ships}
          </span>
        )}
      </div>

      <p className="text-[13px] leading-[1.45] text-tm-text-2">
        Items purchased this week travel together. Fill the box to spread the
        freight.
      </p>

      {/*
        The crate. The fill uses `tmFillY`, not the mock's `tmFill`: the mock
        pairs `transform-origin: bottom` with a scaleX keyframe, so its own
        liquid widens sideways rather than rising. Timing is the mock's literal
        1.4s at .5s on cubic-bezier(.16,1,.3,1).
      */}
      <div
        className="relative mt-1 flex h-[150px] items-end justify-center"
        aria-hidden
      >
        <div className="relative h-[120px] w-[170px] overflow-hidden rounded-b-[14px] border-2 border-t-0 border-[#E1A08E] bg-white/60">
          <div
            className="absolute inset-x-0 bottom-0 origin-bottom bg-[linear-gradient(180deg,#F8907A,#F25B3D)] [animation:tmFillY_1.4s_.5s_cubic-bezier(.16,1,.3,1)_both]"
            style={{ height: `${fillPct}%` }}
          />
          <div
            className="absolute inset-x-0 h-0.5 bg-white/70"
            style={{ bottom: `${fillPct}%` }}
          />
        </div>

        <div className="absolute top-0 left-1/2 h-3.5 w-[186px] -translate-x-1/2 rounded-t-[6px] border-2 border-b-0 border-[#E1A08E] bg-white" />

        <span className="tm-float absolute top-[30px] right-[22px] [animation-duration:3.6s]">
          <Package weight="duotone" className="size-[38px] text-tm-coral" />
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0">
          <span className="tm-nums block text-[22px] leading-none font-bold">
            {fillPct}% full
          </span>
          <span className="text-xs leading-[1.6] font-medium text-tm-text-2">
            {box.label} · {itemLabel} · {weightLabel}
          </span>
        </span>

        {box.marginalSavingGhs > 0 && (
          <span className="shrink-0 text-right">
            <span className="block text-[15px] leading-none font-bold text-tm-green">
              save {formatGhs(box.marginalSavingGhs)}
            </span>
            <span className="text-xs leading-[1.6] font-medium text-tm-text-2">
              by adding one more
            </span>
          </span>
        )}
      </div>
    </Link>
  );
}
