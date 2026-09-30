"use client";

import Link from "next/link";
import { CaretDown, Check } from "@phosphor-icons/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ShopSort } from "../../shop-params";

export interface ShopSortOption {
  value: ShopSort;
  label: string;
  /** Built on the server with `shopHref`, so a sort is an address like any filter. */
  href: string;
}

/**
 * SORT ▾. Every option is a link, so the order is in the address, the back
 * button undoes it, and a sorted page can be sent to someone.
 */
export function ShopSortMenu({
  current,
  options,
}: {
  current: ShopSort;
  options: readonly ShopSortOption[];
}) {
  const active = options.find((o) => o.value === current) ?? options[0];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-10 min-w-0 items-center gap-1.5 rounded-[12px] border-[1.5px] border-tm-border bg-card px-3.5 text-[13.5px] leading-none text-tm-ink transition-colors",
          "hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        )}
      >
        <span className="font-bold tracking-[0.02em] uppercase">Sort</span>
        <span className="truncate font-medium text-tm-text-2">
          {active?.label}
        </span>
        <CaretDown weight="bold" className="size-3.5 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-[14px] border border-tm-border bg-card p-1.5"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            asChild
            className="rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium"
          >
            <Link
              href={option.href}
              scroll={false}
              aria-current={option.value === current ? "true" : undefined}
            >
              <span className="flex-1">{option.label}</span>
              {option.value === current && (
                <Check
                  weight="bold"
                  className="size-3.5 text-tm-coral"
                  aria-hidden
                />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
