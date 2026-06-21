"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const DASHBOARD_NAV_LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/orders", label: "Orders" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardNavLinks() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center gap-8 h-full">
      {DASHBOARD_NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`h-full flex items-center px-1 text-sm font-medium border-b-2 translate-y-[1px] transition-colors ${
              active
                ? "text-[#ff5c35] border-[#ff5c35]"
                : "text-stone-500 hover:text-stone-800 border-transparent hover:border-stone-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
