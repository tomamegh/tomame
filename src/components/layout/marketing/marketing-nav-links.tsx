"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { resolveActiveNavKey } from "./links";
import { FOCUS_RING } from "./styles";
import type { MarketingNavItem } from "./types";

interface MarketingNavLinksProps {
  items: readonly MarketingNavItem[];
  className?: string;
}

/**
 * Desktop nav links. Client-only because the active item is derived from the
 * current route — the rest of the nav stays a server component.
 */
export function MarketingNavLinks({ items, className }: MarketingNavLinksProps) {
  const pathname = usePathname();
  const activeKey = resolveActiveNavKey(pathname, items);

  return (
    <ul className={cn("hidden items-center gap-7 lg:flex", className)}>
      {items.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-sm text-sm font-medium transition-colors duration-200",
                FOCUS_RING,
                isActive ? "text-tm-ink" : "text-tm-text-2 hover:text-tm-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
