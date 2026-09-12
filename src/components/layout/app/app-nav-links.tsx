"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { APP_NAV_ICONS } from "./icons";
import { resolveActiveAppNavKey } from "./links";
import { FOCUS_RING } from "./styles";
import type { AppNavItem } from "./types";

interface AppNavLinksProps {
  items: readonly AppNavItem[];
  className?: string;
}

/**
 * The segmented pill group — `design/TmNavLight.dc.html`.
 *
 * 4px padding around a 2px-gap row of 38px pills on the warm pill track; the
 * active pill is white with a 1px lift. Client-only because the active item is
 * derived from the current route; the rest of the nav stays a server component.
 *
 * Hidden below `lg`, where the bottom tab bar takes over — and because
 * `display:none` removes it from the accessibility tree, exactly one element
 * claims the "Primary" navigation landmark at any breakpoint.
 */
export function AppNavLinks({ items, className }: AppNavLinksProps) {
  const pathname = usePathname();
  const activeKey = resolveActiveAppNavKey(pathname, items);

  return (
    <nav aria-label="Primary" className={cn("hidden lg:block", className)}>
      <ul className="flex items-center gap-0.5 rounded-full border border-[var(--tm-pill-border)] bg-[var(--tm-pill-bg)] p-1">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const Icon = APP_NAV_ICONS[item.icon];

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-[38px] items-center gap-[7px] rounded-full px-4 text-sm font-semibold transition-colors duration-200",
                  FOCUS_RING,
                  isActive
                    ? "bg-card text-tm-ink shadow-[0_1px_3px_rgba(43,36,34,0.08)]"
                    : "text-tm-text-2 hover:text-tm-ink",
                )}
              >
                <Icon
                  size={18}
                  weight="duotone"
                  aria-hidden
                  className="shrink-0"
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
