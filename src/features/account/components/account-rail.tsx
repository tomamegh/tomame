import Link from "next/link";
// Type-only, so the root barrel's `useContext` never reaches a server render.
import type { Icon } from "@phosphor-icons/react";
import {
  BellSimple,
  BookmarkSimple,
  CreditCard,
  MapPinLine,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import {
  ACCOUNT_TABS,
  accountTabHref,
  type AccountTabIcon,
  type AccountTabKey,
} from "../tabs";
import { SignOutButton } from "./sign-out-button";

/**
 * `tabs.ts` names an icon; this maps the name to a glyph. The split keeps the
 * tab list free of component imports so it can be unit tested, and keeps every
 * Phosphor import in a file that renders — phase-2 §5.1, the `/ssr` entry point.
 */
const ICONS: Record<AccountTabIcon, Icon> = {
  user: UserCircle,
  "map-pin": MapPinLine,
  "credit-card": CreditCard,
  bookmark: BookmarkSimple,
  bell: BellSimple,
  shield: ShieldCheck,
};

/**
 * The account screen's left rail.
 *
 * Plain links, not buttons: each tab is a real URL the server renders, so the
 * rail works before hydration and a tab can be linked to from an email.
 *
 * Below `lg` the rail becomes a horizontally scrolling pill row above the
 * panel. It is NOT a bottom action bar — `/app/account` deliberately stays out
 * of `MOBILE_ACTION_BAR_ROUTES`, because a route that opts in there loses the
 * tab bar unconditionally, and the tab bar is the right navigation on an
 * account screen: this page is where you arrive from the nav, not a checkout
 * step with one action to finish.
 */
export function AccountRail({ active }: { active: AccountTabKey }) {
  return (
    <nav
      aria-label="Account sections"
      // `min-w-0` is load-bearing on a phone. A grid item's minimum width is its
      // min-content width, and this nav's min-content is the whole pill row laid
      // out on one line — so without it the single mobile column grew to ~700px,
      // the page scrolled sideways, and every panel was cut off at the right edge
      // (Kelvin's screenshot of the Payment tab). The row scrolls inside itself
      // only once the nav is allowed to be narrower than its content.
      className="tm-up min-w-0 [animation-delay:0.06s] [animation-duration:0.5s]"
    >
      <ul
        className={cn(
          "-mx-5 flex gap-2 overflow-x-auto overscroll-x-contain px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0",
        )}
      >
        {ACCOUNT_TABS.map((tab) => {
          const Glyph = ICONS[tab.icon];
          const current = tab.key === active;
          return (
            <li key={tab.key} className="shrink-0 lg:shrink">
              <Link
                href={accountTabHref(tab.key)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 transition-colors",
                  "text-sm leading-none font-semibold whitespace-nowrap",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral",
                  current
                    ? "bg-tm-tint text-tm-coral-strong"
                    : "text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink",
                )}
              >
                <Glyph
                  weight={current ? "fill" : "duotone"}
                  className="size-5 shrink-0"
                  aria-hidden
                />
                <span className="lg:hidden">{tab.shortLabel}</span>
                <span className="hidden lg:inline">{tab.label}</span>
              </Link>
            </li>
          );
        })}

        {/*
          Not a tab — it has no panel — but it lives in the rail because the rail
          is the one piece of chrome on every account screen. On the phone it is
          the last pill in the row; from `lg` it sits under a hairline at the
          foot of the column, apart from the destinations.
        */}
        <li className="shrink-0 lg:mt-2 lg:shrink lg:border-t lg:border-tm-hairline lg:pt-2">
          <SignOutButton className="w-full" />
        </li>
      </ul>
    </nav>
  );
}
