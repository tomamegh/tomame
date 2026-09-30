"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxesIcon,
  ChevronDownIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  MessageSquareWarningIcon,
  ScanLineIcon,
  ShieldIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { initials } from "./format";

/**
 * The packaging platform's chrome (081).
 *
 * Built for two places: a laptop at the packing bench, and a phone in one hand
 * with a parcel in the other. So the top bar carries the brand, the tabs and a
 * standing Scan button; below `md` the tabs move to a thumb-reach bottom bar
 * with Scan raised in the middle, because scanning is the thing done most often
 * and with the least attention to spare.
 *
 * Every link here is a warehouse route. The only way out is "Admin console",
 * rendered for admins alone — an operator has nowhere else to go, by design.
 */

interface Operator {
  name: string;
  email: string | null;
  isAdmin: boolean;
}

const NAV = [
  { href: "/warehouse", label: "Overview", icon: LayoutGridIcon, exact: true },
  { href: "/warehouse/receive", label: "Receive", icon: InboxIcon },
  { href: "/warehouse/packages", label: "Packages", icon: BoxesIcon },
  { href: "/warehouse/issues", label: "Issues", icon: MessageSquareWarningIcon },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WarehouseShell({
  operator,
  children,
}: {
  operator: Operator;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/warehouse";
  // The label page is a print surface: no chrome on screen either, so what the
  // operator previews is exactly what comes out of the printer.
  const bare = /^\/warehouse\/packages\/[^/]+\/label/.test(pathname);
  if (bare) return <>{children}</>;

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.assign("/auth/login");
  };

  return (
    <div className="min-h-dvh bg-tm-paper">
      <header className="tm-safe-top sticky top-0 z-40 border-b border-tm-hairline bg-card/90 backdrop-blur-[14px] print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-4 px-4 md:px-8">
          <Link href="/warehouse" className="flex shrink-0 items-center gap-2.5" aria-label="Warehouse overview">
            <Logo variant="mark" height={24} decorative />
            <span className="flex flex-col leading-none">
              <Logo variant="wordmark" height={14} decorative />
              <span className="mt-1 text-[10px] font-bold tracking-[0.16em] text-tm-text-3 uppercase">
                Warehouse
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Warehouse">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                    active ? "bg-tm-ink text-white" : "text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/warehouse/scan"
              className="tm-cta-gradient hidden h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] md:inline-flex"
            >
              <ScanLineIcon className="size-4" aria-hidden />
              Scan
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-2 rounded-full border border-tm-border bg-card py-1 pr-2.5 pl-1 transition-colors hover:bg-tm-paper focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none">
                <span className="flex size-7 items-center justify-center rounded-full bg-[image:var(--tm-gradient-avatar)] text-[11px] font-bold text-tm-coral-strong">
                  {initials(operator.name)}
                </span>
                <span className="hidden max-w-[140px] truncate text-[13px] font-semibold text-tm-ink sm:inline">
                  {operator.name}
                </span>
                <ChevronDownIcon className="size-3.5 text-tm-text-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-[14px]">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-tm-ink">{operator.name}</span>
                  {operator.email ? (
                    <span className="truncate text-[12px] font-medium text-tm-text-3">{operator.email}</span>
                  ) : null}
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-tm-amber-bg px-2 py-0.5 text-[11px] font-semibold text-[#7a4a06]">
                    {operator.isAdmin ? "Admin" : "Warehouse operator"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {operator.isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="gap-2">
                      <ShieldIcon className="size-4" aria-hidden />
                      Admin console
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={signOut} className="gap-2">
                  <LogOutIcon className="size-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="tm-clear-warehouse-bar mx-auto w-full max-w-[1320px] px-4 pt-6 md:px-8">
        {children}
      </main>

      <MobileTabBar pathname={pathname} />
    </div>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const [first, second, third, fourth] = NAV;
  const scanActive = isActive(pathname, "/warehouse/scan");
  return (
    <nav
      aria-label="Warehouse"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-tm-hairline bg-card/95 backdrop-blur-[14px] md:hidden print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-16 max-w-[520px] grid-cols-5 items-center">
        {[first, second].map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="flex justify-center">
          <Link
            href="/warehouse/scan"
            aria-label="Scan a label"
            aria-current={scanActive ? "page" : undefined}
            className="tm-cta-gradient -mt-7 flex size-14 items-center justify-center rounded-full text-white shadow-[0_14px_30px_-12px_rgba(244,63,94,0.7)] ring-4 ring-tm-paper transition-transform active:scale-95"
          >
            <ScanLineIcon className="size-6" aria-hidden />
          </Link>
        </div>
        {[third, fourth].map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ item, pathname }: { item: (typeof NAV)[number]; pathname: string }) {
  const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors",
        active ? "text-tm-coral-strong" : "text-tm-text-3",
      )}
    >
      <item.icon className={cn("size-5", active && "stroke-[2.4]")} aria-hidden />
      {item.label}
    </Link>
  );
}

