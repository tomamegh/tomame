"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRinging, House, Package, ShoppingBagOpen, Sparkle } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { haptic, onAppResume, setStatusBar } from "@/lib/native/bridge";
import { bagKeys, fetchBag } from "@/features/bag/hooks/useAddToBag";
import { NativeNotifications } from "./native-notifications";

/** Which screens hide the tab bar or need their own page background. */
function chromeFor(pathname: string): { tabs: boolean; className: string } {
  if (pathname.startsWith("/m/welcome")) return { tabs: false, className: "no-tabs welcome-bg" };
  if (pathname.startsWith("/m/paid")) return { tabs: false, className: "no-tabs paid-bg" };
  if (pathname.startsWith("/m/product/")) return { tabs: false, className: "no-tabs" };
  if (pathname === "/m/bag") return { tabs: true, className: "has-paybar" };
  return { tabs: true, className: "" };
}

/**
 * The root of every `/m` screen: the scoped `.tm-m` styles, the tab bar, and the status bar
 * style for the iPhone app. A signed-out viewer only reaches the welcome screen, which has
 * no tabs, so the bag badge query never runs without a session.
 */
export function MobileShell({ bagCount, children }: { bagCount: number; children: ReactNode }) {
  const pathname = usePathname() ?? "/m";
  const chrome = chromeFor(pathname);

  useEffect(() => setStatusBar("dark-text"), []);

  return (
    <div className={cn("tm-m", chrome.className)}>
      {children}
      {chrome.tabs && <TabBar pathname={pathname} initialBagCount={bagCount} />}
      {chrome.tabs && <NativeNotifications />}
    </div>
  );
}

const TABS = [
  { href: "/m", label: "Home", Icon: House, match: (p: string) => p === "/m" || p.startsWith("/m/account") },
  { href: "/m/watch", label: "Watch", Icon: BellRinging, match: (p: string) => p.startsWith("/m/watch") },
  { href: "/m/chat", label: "Buy for me", Icon: Sparkle, match: (p: string) => p.startsWith("/m/chat") },
  { href: "/m/orders", label: "Orders", Icon: Package, match: (p: string) => p.startsWith("/m/orders") },
  { href: "/m/bag", label: "Bag", Icon: ShoppingBagOpen, match: (p: string) => p.startsWith("/m/bag") },
];

function TabBar({ pathname, initialBagCount }: { pathname: string; initialBagCount: number }) {
  // Shares the ["bag"] cache with the bag screen and add-to-bag, so the badge moves the
  // moment a line is added or removed anywhere in the app.
  const bag = useQuery({ queryKey: bagKeys.all, queryFn: fetchBag, staleTime: 30_000 });
  const count = bag.data?.item_count ?? initialBagCount;
  const [bump, setBump] = useState(false);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 500);
      last.current = count;
      return () => clearTimeout(t);
    }
    last.current = count;
  }, [count]);

  // Coming back to the app re-reads the bag: a payment or another device may have changed it.
  const refetch = bag.refetch;
  useEffect(() => onAppResume(() => void refetch()), [refetch]);

  return (
    <nav className="tabbar" aria-label="Tomame">
      {TABS.map(({ href, label, Icon, match }) => {
        const on = match(pathname);
        if (href === "/m/chat") {
          return (
            <Link key={href} href={href} className={cn("tab tab-ai", on && "on")} onClick={() => haptic("light")} aria-current={on ? "page" : undefined}>
              <span className="orb"><Icon size={26} weight="fill" /></span>
              <span>{label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            className={cn("tab", on && "on")}
            onClick={() => {
              haptic("select");
              if (on) window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-current={on ? "page" : undefined}
          >
            <Icon size={25} weight={on ? "duotone" : "regular"} />
            {label}
            {href === "/m/bag" && count > 0 && <span className={cn("badge nums", bump && "bump")}>{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
