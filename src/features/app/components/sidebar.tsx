"use client";

import * as React from "react";
import { BellIcon, GalleryVerticalEnd, LayoutDashboardIcon, PackageSearchIcon, ShoppingCartIcon } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import Link from "next/link";

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Overview",
      url: "/app",
      icon: LayoutDashboardIcon,
      isActive: true,
    },
    {
      title: "Products",
      url: "/app/products",
      icon: PackageSearchIcon,
    },
    {
      title: "Orders",
      url: "/app/orders",
      icon: ShoppingCartIcon,
    },
    {
      title: "Notifications",
      url: "/app/notifications",
      icon: BellIcon,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // const {} = usePath
  return (
    <div className="basis-1/4 shrink-0 p-6 bg-white shadow-md rounded-xl sticky top-28 hidden md:block">
      <nav className="space-y-1">
        {data.navMain.map((item) => (
          <Link
            key={item.title}
            href={item.url}
            // aria-selected={}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-slate-100 hover:text-stone-900 transition-colors"
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
