import Link from "next/link";
import {
  CaretRight,
  ChatCircleDots,
  LinkSimple,
  Storefront,
} from "@phosphor-icons/react/ssr";
// The `/ssr` entry ships the components but not the shared type; this import is
// erased at compile time, so nothing client-side comes along with it.
import type { Icon } from "@phosphor-icons/react";

import { buyForMeHref } from "@/features/extraction/components/buy-for-me-mode";
import { cn } from "@/lib/utils";

/**
 * Where "Ask us to buy it" goes.
 *
 * The ask half of `/app/orders/new` now exists, so this points at it rather
 * than at `/contact`, which is where it landed while that screen was still
 * being built. It is deliberately NOT the `wa.me` href `AskBuyerCard` prefers:
 * that one only exists when `site_settings.whatsapp_number` is filled in, and a
 * door that disappears on some deployments is not a door.
 */
const ASK_HREF = buyForMeHref("ask");

interface EntryDoor {
  href: string;
  icon: Icon;
  title: string;
  /** One line. It says what the door actually does, not what it is called. */
  sub: string;
}

/**
 * The three ways in, in the order a shopper should try them: the link they
 * already have, the things we have already priced, and — last — the thing we
 * have to go and find for them.
 */
const DOORS: readonly EntryDoor[] = [
  {
    href: buyForMeHref("paste"),
    icon: LinkSimple,
    title: "Paste a link",
    sub: "From Amazon, eBay, Walmart, or any store we support.",
  },
  {
    href: buyForMeHref("browse"),
    icon: Storefront,
    title: "Browse what's priced",
    sub: "Products we have already read, with the cedi total worked out.",
  },
  {
    href: ASK_HREF,
    icon: ChatCircleDots,
    title: "Ask us to buy it",
    sub: "No link? Describe it and a buyer in the US goes and finds it.",
  },
];

export interface EntryDoorsProps {
  className?: string;
}

/**
 * The three doors, sitting directly under the hero's trust chips.
 *
 * WHAT PROBLEM THIS SOLVES. Tomame will get you a thing three ways: paste a
 * link, pick something we have already read and priced, or describe it in words
 * and a buyer in the US goes and finds it. Only the first two were ever
 * discoverable from Home, and the third — the one that covers every store we do
 * NOT support, every listing the extractor chokes on, and every "I saw it on
 * Instagram" — was a small card near the bottom of the page. A customer who
 * does not have a link had to scroll past everything the app could do for
 * people who did.
 *
 * WHY IT IS QUIETER THAN THE PASTE BAR, ON PURPOSE. This row is not a second
 * hero and must never read like one. The `<h1>` and the paste bar stay the
 * loudest things on the screen, because pasting a link is still the fastest
 * path to a price and the one most people want. So: 13.5px titles against a
 * 34–50px heading, a hairline border instead of a fill, no gradient, and the
 * only coral on the card is the 40px icon tile. Hovering warms the border and
 * moves nothing — a card that lifts competes for the eye with the thing the
 * page actually wants you to use.
 *
 * ONE ANCHOR PER CARD. The whole card is a single `<Link>`, the way
 * `CatalogProductCard` is: a keyboard reaches each door in one stop and a
 * screen reader hears one destination rather than an icon, a heading and an
 * arrow that all go to the same place.
 *
 * NO ENTRANCE ANIMATION OF ITS OWN. It renders inside Row A, which already
 * carries `tm-up`; a nested `tm-up` would compound the parent's transform and
 * make this row — the quiet one — the only thing on the page that moves twice.
 *
 * A Server Component. Three links have nothing to hold.
 */
export function EntryDoors({ className }: EntryDoorsProps) {
  return (
    <nav aria-label="Ways to order" className={cn("min-w-0", className)}>
      {/* `minmax(0,1fr)` rather than a bare `1fr`: an implicit grid column is
          sized to its widest content, and on a 390px phone that is what pushes
          the whole page sideways. */}
      <ul className="grid min-w-0 gap-2.5 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
        {DOORS.map((door) => {
          const DoorIcon = door.icon;
          return (
            <li key={door.title} className="min-w-0">
              <Link
                href={door.href}
                className={cn(
                  "flex min-h-[76px] min-w-0 items-center gap-3 rounded-[18px] border border-tm-border bg-card px-4 py-3.5 transition-colors",
                  "hover:border-tm-coral/30",
                  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral">
                  <DoorIcon weight="duotone" className="size-5" aria-hidden />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[13.5px] leading-[1.2] font-bold text-tm-ink">
                    {door.title}
                  </span>
                  <span className="text-[11.5px] leading-[1.35] font-medium text-tm-text-3">
                    {door.sub}
                  </span>
                </span>

                <CaretRight
                  weight="bold"
                  className="size-3.5 shrink-0 text-tm-text-3"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
