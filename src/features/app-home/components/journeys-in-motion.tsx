import Link from "next/link";
import { ArrowRight, Path } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { HomeJourney } from "../types";
import { formatEtaDate, PLACEHOLDER_THUMB_CLASS } from "./format";
import { JourneyTrack, journeyToneText } from "./journey-track";
import { formatGhs } from "@/features/marketing/format";

export interface JourneysInMotionProps {
  /** Newest first, cancelled excluded. An empty array is a real state. */
  journeys: readonly HomeJourney[];
  className?: string;
}

/**
 * "Journeys in motion" — one row per live order, each on the five-stop track.
 *
 * Spans the full row: the mock's freight-box card next to it is not built. It
 * needs a bag to aggregate weight over and a box-capacity constant, neither of
 * which exists (Phase 4), and stubbing "62% full · save GH₵96" would be a
 * fabricated number on the customer's own dashboard.
 */
export function JourneysInMotion({
  journeys,
  className,
}: JourneysInMotionProps) {
  return (
    <section
      aria-labelledby="journeys-in-motion-heading"
      className={cn(
        "tm-up flex flex-col gap-[18px] rounded-[24px] border border-tm-border bg-card p-6",
        "[animation-delay:0.2s]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h2
          id="journeys-in-motion-heading"
          className="font-display text-[22px] leading-none font-bold"
        >
          Journeys in motion
        </h2>
        <Link
          href="/app/orders"
          className="inline-flex items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
        >
          All journeys
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      {journeys.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {journeys.map((journey) => (
            <li key={journey.id}>
              <JourneyRow journey={journey} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyJourneys />
      )}
    </section>
  );
}

function JourneyRow({ journey }: { journey: HomeJourney }) {
  const { stage } = journey;
  // The ETA is an admin-entered date written only on the `in_transit`
  // transition. When there is none we show the stage's own hint — never an
  // invented "Lands Sat".
  const eta = stage.etaDate
    ? formatEtaDate(stage.etaDate, { landed: stage.isComplete })
    : null;

  return (
    <article className="grid grid-cols-[56px_1fr] items-center gap-4 rounded-[16px] bg-tm-paper p-3.5 sm:grid-cols-[56px_1fr_auto]">
      {/*
        `HomeJourney` carries no image: `orders` stores `product_image_url`, but
        the Home query does not select it, so every row draws the design's
        placeholder rather than a guessed thumbnail.
      */}
      <div
        className={cn("size-14 rounded-[12px]", PLACEHOLDER_THUMB_CLASS)}
        aria-hidden
      />

      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex justify-between gap-3">
          <h3 className="truncate text-sm leading-[1.3] font-semibold">
            {journey.productName}
          </h3>
          <span
            className={cn(
              "shrink-0 text-xs leading-none font-semibold whitespace-nowrap",
              journeyToneText(stage.tone),
            )}
          >
            {stage.label}
          </span>
        </div>

        <JourneyTrack stage={stage} label={journey.productName} />
      </div>

      <div className="col-span-2 flex flex-col gap-1 text-right sm:col-span-1">
        {journey.totalGhs !== null && (
          <span className="tm-nums text-sm leading-none font-bold">
            {formatGhs(journey.totalGhs)}
          </span>
        )}
        <span className="text-[11px] leading-none font-medium text-tm-text-3">
          {eta ?? stage.hint}
        </span>
      </div>
    </article>
  );
}

/**
 * The state a new customer actually sees. It names the next step rather than
 * showing an example journey, which would be indistinguishable from a real one.
 */
function EmptyJourneys() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[16px] bg-tm-paper p-6">
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-green-bg text-tm-green">
        <Path weight="duotone" className="size-[22px]" aria-hidden />
      </span>
      <p className="text-sm leading-[1.45] font-semibold">
        Nothing in motion yet
      </p>
      <p className="max-w-[46ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">
        Once you approve a landed price and pay, the parcel appears here and
        walks the five stops from Paid to your door.
      </p>
    </div>
  );
}
