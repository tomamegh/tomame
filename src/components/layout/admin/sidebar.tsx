"use client";

import * as React from "react";
import {
  Command,
  CreditCardIcon,
  LayoutGridIcon,
  LifeBuoy,
  Send,
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
    ],
  },
];

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },

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

export default function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="sidebar" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Tomame</span>
                  <span className="truncate text-xs">Enterprise</span>
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
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
