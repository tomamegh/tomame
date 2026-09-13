import Link from "next/link";
import { Tote } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { bagLabel } from "./links";
import { FOCUS_RING, NAV_ICON_BUTTON } from "./styles";

interface BagButtonProps {
  /** Server-resolved `sum(quantity)` over the open bag (migration 048). */
  count: number;
}

/**
 * Nav tote with the bag count — `design/TmNavLight.dc.html`: a 40px circle,
 * the count in an 18px coral pill at the top-right (`font:700 11px/18px`,
 * `padding:0 5px`, `min-width:18px`).
 *
 * The count is the real `cart_items` sum for this viewer, never a literal, and
 * the pill is omitted at zero so an empty bag never shows a "0". It pops in
 * (`tm-pop`) so a just-added line is noticed after the layout refresh.
 */
export function BagButton({ count }: BagButtonProps) {
  return (
    <Link
      href="/app/bag"
      aria-label={bagLabel(count)}
      className={cn(NAV_ICON_BUTTON, FOCUS_RING)}
      data-testid="bag-button"
    >
      <Tote size={22} weight="regular" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          data-testid="bag-count"
          className="tm-pop tm-nums absolute top-px right-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-tm-coral px-[5px] text-[11px] leading-[18px] font-bold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
