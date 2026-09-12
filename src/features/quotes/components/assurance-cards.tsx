import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowUUpLeft,
  CalendarCheck,
  ShieldCheck,
} from "@phosphor-icons/react/ssr";

import type { PricingBreakdown } from "@/lib/pricing";
import type { QuoteAssurance } from "../types";
import { formatEtaRange } from "./format";

/**
 * The ONLY names a `quote_assurance` row may use.
 *
 * Resolving a component from a database string is how a content edit becomes a
 * build failure, so the map is explicit and a name that is not in it renders a
 * card with no glyph rather than crashing or guessing at a near-match.
 */
const ASSURANCE_ICONS: Record<string, Icon> = {
  CalendarCheck,
  ShieldCheck,
  ArrowUUpLeft,
};

/**
 * The slug whose headline is replaced by the real, computed delivery window.
 * Its seeded `title` is the fallback for a region with no transit days on file.
 */
const DELIVERY_WINDOW_SLUG = "delivery-window";

export interface AssuranceCardsProps {
  /** `site_content` rows of kind `quote_assurance`, in sort order. */
  assurances: readonly QuoteAssurance[];
  /** Supplies `delivery_eta_from` / `delivery_eta_to` for the window card. */
  pricing: PricingBreakdown | null;
}

/**
 * The three cards under the receipt: delivery window, money held, full refund.
 *
 * Copy, icons and policy links all come from `site_content`; the only thing
 * decided here is that the delivery card shows the server's computed window
 * when there is one.
 */
export function AssuranceCards({ assurances, pricing }: AssuranceCardsProps) {
  if (assurances.length === 0) return null;

  const window =
    pricing?.delivery_eta_from && pricing.delivery_eta_to
      ? formatEtaRange(pricing.delivery_eta_from, pricing.delivery_eta_to)
      : null;

  return (
    <ul className="flex flex-col gap-2.5 sm:flex-row">
      {assurances.map((assurance) => {
        const AssuranceIcon = assurance.icon
          ? ASSURANCE_ICONS[assurance.icon]
          : undefined;
        const headline =
          assurance.slug === DELIVERY_WINDOW_SLUG && window
            ? window
            : assurance.title;

        const body = (
          <>
            {AssuranceIcon && (
              <AssuranceIcon
                weight="duotone"
                className="size-5 text-tm-coral"
                aria-hidden
              />
            )}
            <b className="tm-nums text-[13px] leading-[1.2] font-bold">
              {headline}
            </b>
            {assurance.body && (
              <span className="text-xs leading-[1.3] font-normal text-tm-text-3">
                {assurance.body}
              </span>
            )}
          </>
        );

        return (
          <li key={assurance.slug} className="flex-1">
            {assurance.href ? (
              <Link
                href={assurance.href}
                className="flex h-full flex-col gap-1.5 rounded-[16px] border border-tm-border bg-card p-3.5 transition-colors hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
              >
                {body}
              </Link>
            ) : (
              <div className="flex h-full flex-col gap-1.5 rounded-[16px] border border-tm-border bg-card p-3.5">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
