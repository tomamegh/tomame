import { HandWaving } from "@phosphor-icons/react/ssr";

import { formatMovingParcels } from "@/components/layout/app/links";
import { cn } from "@/lib/utils";
import type { HomeGreeting } from "../types";
import { formatGreetingFor } from "./format";

export interface GreetingChipProps {
  greeting: HomeGreeting;
  className?: string;
}

/**
 * "Afternoon, Kwame · 2 parcels moving".
 *
 * The parcel clause is dropped entirely at zero — `formatMovingParcels` returns
 * null — so a new customer is greeted rather than told they have "0 parcels
 * moving". The count is a database count of orders in `paid` | `processing` |
 * `in_transit`, never a length of a rendered list.
 */
export function GreetingChip({ greeting, className }: GreetingChipProps) {
  const moving = formatMovingParcels(greeting.movingCount);

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full bg-tm-tint px-3 py-[7px]",
        "text-xs leading-none font-semibold text-tm-coral-strong",
        className,
      )}
    >
      <HandWaving weight="fill" className="size-3.5 shrink-0" aria-hidden />
      {formatGreetingFor(greeting.timeOfDay, greeting.firstName)}
      {moving ? ` · ${moving}` : null}
    </span>
  );
}
