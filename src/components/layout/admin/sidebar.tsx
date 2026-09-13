"use client";

import Link from "next/link";
import { ArrowSquareOut } from "@phosphor-icons/react/ssr";

import { Logo } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useProfile } from "@/features/account/hooks/useProfile";
import { useQueueCounts } from "@/features/admin/hooks/useQueueCounts";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "./nav-links";
import { NavMain } from "./nav-main";
import { NavUser } from "./user";

/**
 * The admin sidebar — v2.
 *
 * Three things were wrong with it. The brand mark was a 16px glyph in a tinted
 * square with the word "Tomame" typed beside it, rather than the real lockup.
 * The palette was the pre-redesign stone/slate, so the admin looked like a
 * different product from the storefront it administers. And it ended in two
 * dead links, "Support" and "Feedback", both pointing at `#`.
 *
 * It now carries the real logo, the v2 tokens, every destination the v2 feature
 * work created, and badges saying which queues have somebody waiting in them.
 *
 * It renders nothing until the profile resolves. That is not a loading nicety:
 * `NavUser` needs a real user and the alternative is a skeleton of a sidebar
 * that appears and then shifts. The route itself is already gated by
 * `src/proxy.ts`, so a non-admin never reaches this component at all.
 */
export default function AppSidebar(props: { className?: string }) {
  const { data: user, isLoading } = useProfile();
  // Deliberately unguarded by `isLoading`: the counts are for the badges only,
  // and a failed count renders no badge rather than blocking the nav.
  const { data: counts } = useQueueCounts();

  if (isLoading) return null;
  if (!user) return null;

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      {...props}
      className={cn("border-tm-border bg-card", props.className)}
    >
      <SidebarHeader className="border-b border-tm-hairline">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-tm-hairline">
              <Link href="/admin" aria-label="Tomame admin — dashboard">
                {/*
                  Two spellings of the mark, one downloaded: the full horizontal
                  lockup while the rail is open, and the mark alone once it
                  collapses to icons, where the wordmark would be clipped.
                */}
                <Logo
                  variant="mark"
                  height={22}
                  decorative
                  className="shrink-0 group-data-[collapsible=icon]:mx-auto"
                />
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <Logo variant="wordmark" height={15} decorative className="mb-0.5" />
                  <span className="truncate text-[11px] leading-none font-medium text-tm-text-3">
                    Admin
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 pt-2">
        {ADMIN_NAV.map((group, i) => (
          <NavMain key={group.label ?? `group-${i}`} group={group} counts={counts} />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-tm-hairline">
        {/*
          Replaces "Support" and "Feedback", which both pointed at `#`. This one
          goes somewhere: the storefront the admin is administering.
        */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="sm"
              tooltip="View storefront"
              className="text-[13px] font-semibold text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink"
            >
              <Link href="/app">
                <ArrowSquareOut className="size-4 shrink-0" weight="bold" />
                <span>View storefront</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
