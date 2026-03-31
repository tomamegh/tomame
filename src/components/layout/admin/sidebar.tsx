"use client";


import {
  Command,
  CreditCardIcon,
  LayoutGridIcon,
  LifeBuoy,
  Send,
  Settings2Icon,
  ShoppingCartIcon,
  TruckIcon,
  UsersRoundIcon,
} from "lucide-react";

import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LinkItem } from "@/types";
import { useProfile } from "@/features/account/hooks/useProfile";

const NAV_LIST: Array<{ label?: string; links: LinkItem[] }> = [
  {
    label: undefined,
    links: [
      {
        title: "Dashboard",
        url: "/admin",
        icon: LayoutGridIcon,
      },
      {
        title: "Orders",
        url: "/admin/orders",
        icon: ShoppingCartIcon,
      },
      {
        title: "Deliveries",
        url: "/admin/deliveries",
        icon: TruckIcon,
      },
      {
        title: "Transactions",
        url: "/admin/transactions",
        icon: CreditCardIcon,
      },
    ],
  },
  {
    label: "System",
    links: [
      {
        title: "Users",
        url: "/admin/users",
        icon: UsersRoundIcon,
      },
      {
        title: "Settings",
        url: "/admin/settings",
        icon: Settings2Icon,
      },
    ],
  },
];

const data = {
  navSecondary: [
    {
      title: "Support",
      url: "#",
      icon: LifeBuoy,
    },
    {
      title: "Feedback",
      url: "#",
      icon: Send,
    },
  ],
};

export default function AppSidebar(props: { className?: string }) {
  const { data: user, isLoading } = useProfile();

  if (isLoading) return null;
  if (!user) return null;

  return (
    <Sidebar variant="sidebar" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="gradient-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Tomame</span>
                  <span className="truncate text-xs text-neutral-400">
                    Admin Dashboard
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="mt-5">
        {NAV_LIST.map((nav, i) => (
          <NavMain key={i.toString()} label={nav.label} links={nav.links} />
        ))}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
