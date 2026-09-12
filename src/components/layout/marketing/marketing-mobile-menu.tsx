"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, X } from "@phosphor-icons/react/ssr";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { resolveActiveNavKey } from "./links";
import { FOCUS_RING } from "./styles";
import type { MarketingNavItem } from "./types";
import { Logo } from "@/components/brand/logo";

interface MarketingMobileMenuProps {
  items: readonly MarketingNavItem[];
  isAuthenticated: boolean;
}

/**
 * Below `lg` the nav collapses to a right-hand drawer. The mocks are desktop
 * only, so this reuses the app's existing drawer pattern with the redesign's
 * light surfaces — no dark header, black for text only.
 */
export function MarketingMobileMenu({
  items,
  isAuthenticated,
}: MarketingMobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activeKey = resolveActiveNavKey(pathname, items);

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        aria-label="Open menu"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full border border-tm-border bg-card text-tm-ink transition-colors hover:bg-tm-tint lg:hidden",
          FOCUS_RING,
        )}
      >
        <List size={20} />
      </DrawerTrigger>

      <DrawerContent
        aria-describedby={undefined}
        className="border-tm-border bg-card"
      >
        <DrawerTitle className="sr-only">Menu</DrawerTitle>

        <div className="flex h-16 items-center justify-between border-b border-tm-hairline px-5">
          <Logo variant="horizontal" height={20} />
          <DrawerClose
            aria-label="Close menu"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full text-tm-text-2 transition-colors hover:bg-tm-tint hover:text-tm-ink",
              FOCUS_RING,
            )}
          >
            <X size={18} />
          </DrawerClose>
        </div>

        <nav aria-label="Site menu" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const isActive = item.key === activeKey;

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center rounded-lg px-3 py-3 text-base font-medium transition-colors",
                      FOCUS_RING,
                      isActive
                        ? "bg-tm-tint text-tm-ink"
                        : "text-tm-text-2 hover:bg-tm-tint/60 hover:text-tm-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex flex-col gap-2 border-t border-tm-hairline p-5">
          {isAuthenticated ? (
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className={cn(
                "tm-cta-gradient inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold",
                FOCUS_RING,
              )}
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/signup"
                onClick={() => setOpen(false)}
                className={cn(
                  "tm-cta-gradient inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold",
                  FOCUS_RING,
                )}
              >
                Get started
              </Link>
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-full border border-tm-border px-5 text-sm font-semibold text-tm-ink transition-colors hover:bg-tm-tint",
                  FOCUS_RING,
                )}
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
