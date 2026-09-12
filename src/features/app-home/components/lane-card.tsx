import Link from "next/link";
import { ArrowRight, GlobeHemisphereWest } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { HomeLanes } from "../types";

export interface LaneCardProps {
  /**
   * Derived from `regions` by `buildLanes()`. Null when no lane is `live` —
   * nothing is purchasable, so there is no honest lane to advertise and the
   * card renders nothing.
   */
  lanes: HomeLanes | null;
  className?: string;
}

/**
 * "Shipping from the USA" — Row C, right column, top card.
 *
 * A Server Component with no state of its own: heading, body and waitlist
 * label all arrive pre-derived from the `regions` rows, so an admin opening the
 * UK lane rewrites this card without a deploy. The only thing hardcoded here is
 * the layout.
 */
export function LaneCard({ lanes, className }: LaneCardProps) {
  if (!lanes) return null;

  return (
    <section
      aria-labelledby="home-lanes-heading"
      className={cn(
        "tm-up flex min-w-0 flex-col gap-2.5 rounded-[24px] border border-tm-border bg-card p-[22px]",
        "[animation-delay:0.4s]",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-green-bg text-tm-green">
        <GlobeHemisphereWest
          weight="duotone"
          className="size-[22px]"
          aria-hidden
        />
      </span>

      <h3
        id="home-lanes-heading"
        className="mt-1.5 font-display text-[17px] leading-[1.2] font-bold"
      >
        {lanes.heading}
      </h3>

      <p className="text-[13px] leading-[1.45] text-tm-text-2">{lanes.body}</p>

      {lanes.waitlist && (
        <Link
          href={lanes.waitlist.href}
          className="mt-auto inline-flex self-start items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
        >
          {lanes.waitlist.label}
          <ArrowRight weight="bold" className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}
