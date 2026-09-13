"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { AdminQueueCounts } from "@/db/queries/admin-queues";
import { formatNavBadge, isAdminNavActive, type AdminNavGroup } from "./nav-links";

/**
 * One group of admin destinations.
 *
 * Presentational: the route model and the active-route rule live in
 * `nav-links.ts`, and the counts are resolved once by the sidebar and passed
 * down, so this never queries anything.
 *
 * The collapsible sub-item machinery that used to be here went with it — no
 * admin entry has ever had children, so it was a `Collapsible`, a trigger and a
 * `SidebarMenuSub` rendering nothing on every item.
 */
export function NavMain({
  group,
  counts,
}: {
  group: AdminNavGroup;
  counts?: AdminQueueCounts;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {group.label && (
        <SidebarGroupLabel className="text-[11px] font-bold tracking-normal text-tm-text-3">
          {group.label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu>
        {group.links.map((link) => {
          const active = isAdminNavActive(pathname, link.url);
          const badge = link.badge ? formatNavBadge(counts?.[link.badge]) : null;

          return (
            <SidebarMenuItem key={link.url}>
              <SidebarMenuButton
                asChild
                tooltip={link.title}
                isActive={active}
                className={cn(
                  "h-9 rounded-xl text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-tm-tint text-tm-coral-strong hover:bg-tm-tint hover:text-tm-coral-strong"
                    : "text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink",
                )}
              >
                <Link href={link.url}>
                  <link.icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{link.title}</span>
                  {badge && (
                    <span
                      // Amber, not coral: this is "someone is waiting", the same
                      // meaning amber carries everywhere else in the product.
                      // Coral is the brand's action colour and is not spent here.
                      className="tm-nums ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tm-amber-bg px-1.5 text-[11px] leading-none font-bold text-[#7a4a06] group-data-[collapsible=icon]:hidden"
                      aria-label={`${badge} waiting`}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
