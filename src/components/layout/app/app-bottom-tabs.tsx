"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { APP_NAV_ICONS } from "./icons";
import { resolveActiveAppNavKey } from "./links";
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
 */
export function AppBottomTabs({ items, className }: AppBottomTabsProps) {
  const pathname = usePathname();
  const activeKey = resolveActiveAppNavKey(pathname, items);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "sticky bottom-0 z-50 grid grid-cols-4 border-t border-tm-border bg-card px-2 pt-2.5 lg:hidden",
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
