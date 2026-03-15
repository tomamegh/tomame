"use client";

import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { LinkItem } from "@/types";
import Link from "next/link";

interface Props {
  label?: string;
  links: LinkItem[];
}

export function NavMain({ label, links }: Props) {
  const pathname = usePathname();

  const isActive = (url: string) => {
    if (pathname === url) return true;
    // Only do prefix matching for URLs with 2+ segments (e.g. /admin/orders).
    // Single-segment paths like /admin must be exact-only so the dashboard
    // link doesn't light up on /admin/orders, /admin/users, etc.
    const depth = url.split("/").filter(Boolean).length;
    return depth >= 2 && pathname.startsWith(`${url}/`);
  };
  return (
    <>
      <SidebarGroup>
        {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
        <SidebarMenu>
          {links.map((link) => (
            <Collapsible key={link.title} asChild defaultOpen={link.isActive}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={link.title} className={`transition-all hover:bg-neutral-100 ${isActive(link.url) ? 'bg-primary text-white hover:bg-primary hover:text-white': 'text-stone-900'}`}>
                  <Link href={link.url}>
                    <link.icon />
                    <span>{link.title}</span>
                  </Link>
                </SidebarMenuButton>
                {link.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90">
                        <ChevronRight />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {link.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <a href={subItem.url}>
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
