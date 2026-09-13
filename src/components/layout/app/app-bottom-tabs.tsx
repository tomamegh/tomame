"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { APP_NAV_ICONS } from "./icons";
import { ownsMobileBottomBar, resolveActiveAppNavKey } from "./links";
import { FOCUS_RING } from "./styles";
import type { AppNavItem } from "./types";

interface AppBottomTabsProps {
  items: readonly AppNavItem[];
  className?: string;
}

/**
 * The 390px bottom tab bar — `id="v2-mobile"` in
 * `design/Tomame - New Direction v2.dc.html`.
 *
 * 84px tall on a white ground with a hairline top edge, four equal columns, and
 * the mock's short labels ("Buy", "Watch"). The active tab is the `fill` icon
 * weight at 600 in coral; inactive tabs are `regular` at 500 in muted text —
 * the mocks treat nav-active as a status, which is why the weight changes.
 *
 * The 22px of bottom padding in the mock is the home-indicator inset; it is
 * expressed here as `env(safe-area-inset-bottom)` with the mock's value as the
 * floor, so the bar clears the indicator on a real device.
 *
 * It stands down entirely on a route that pins its own action bar — see
 * `ownsMobileBottomBar`. The bar is mobile-only in the first place, so there is
 * nothing left to render at any width once it does.
 *
 * `fixed`, NOT `sticky` — the same choice `BagPayBar` made, for the same reason.
 * As a sticky element at the end of the shell's flex column it sat wherever the
 * shell's bottom edge happened to be, and on iOS Safari that edge and the
 * visual viewport disagree: Kelvin's screenshot of Home had the bar floating
 * mid-screen with a viewport's worth of blank page underneath it. A fixed bar
 * is pinned to the viewport regardless of what the document does. The shell
 * reserves its height below `lg` (`APP_BOTTOM_TABS_PADDING` on the layout's
 * `<main>`), so no content hides behind it.
 */

/**
 * Bottom padding the app shell's `<main>` needs below `lg` so the last card
 * clears the fixed bar: the bar's own height (≈84px) plus the home-indicator
 * inset it grows by on a real device.
 */
// A named utility in globals.css, not an arbitrary padding class. Two arbitrary
// spellings were tried and both measured 0px in the browser: one was invalid
// CSS (calc needs spaces around its operator), and the valid one was dropped by
// tailwind-merge inside cn(). Do not write the arbitrary form even in a
// comment — Tailwind scans comments for class candidates, and a bracketed
// class with an ellipsis in it compiled into a rule the dev server could not
// parse, taking every page down with a 500. The utility carries its own `lg`
// reset, so the caller pairs it with nothing.
export const APP_BOTTOM_TABS_PADDING = "tm-clear-tab-bar";
export function AppBottomTabs({ items, className }: AppBottomTabsProps) {
  const pathname = usePathname();
  const activeKey = resolveActiveAppNavKey(pathname, items);

  if (ownsMobileBottomBar(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-tm-border bg-card px-2 pt-2.5 lg:hidden",
        "pb-[max(22px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const Icon = APP_NAV_ICONS[item.icon];

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] transition-colors duration-200",
              FOCUS_RING,
              isActive
                ? "font-semibold text-tm-coral"
                : "font-medium text-tm-text-3",
            )}
          >
            <Icon
              size={24}
              weight={isActive ? "fill" : "regular"}
              aria-hidden
              className="shrink-0"
            />
            {item.mobileLabel}
          </Link>
        );
      })}
    </nav>
  );
}
