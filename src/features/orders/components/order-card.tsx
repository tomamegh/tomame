"use client";

import Link from "next/link";
import Image from "next/image";
import {
  TruckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  ArrowRightIcon,
  MoreVerticalIcon,
  ShoppingBagIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { OrderStatusBadge } from "./order-status-badge";
import { Button } from "@/components/ui/button";
import type { Order } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BrandConfig = {
  pill: string;
  color: string;
  icon: string | null;
};

function getBrandConfig(platform: string): BrandConfig {
  const p = platform.toLowerCase();
  if (p.includes("amazon"))
    return {
      pill: "bg-amber-50 text-amber-700 border border-amber-200/60",
      color: "#ff9900",
      icon: "/icons/Amazon.svg",
    };
  if (p.includes("ebay"))
    return {
      pill: "bg-blue-50 text-blue-700 border border-blue-200/60",
      color: "#0064d2",
      icon: "/icons/ebay.svg",
    };
  if (p.includes("shein"))
    return {
      pill: "bg-stone-100 text-stone-800 border border-stone-200",
      color: "#111827",
      icon: null,
    };
  if (p.includes("aliexpress"))
    return {
      pill: "bg-rose-50 text-rose-700 border border-rose-200/60",
      color: "#e62e04",
      icon: null,
    };
  return {
    pill: "bg-orange-50 text-orange-700 border border-orange-200/60",
    color: "#ff5c35",
    icon: null,
  };
}

function getPlatformLabel(order: Order): string {
  const meta = order.extraction_metadata?.platform;
  if (meta) return meta;
  const url = order.product_url.toLowerCase();
  if (url.includes("amazon")) return "Amazon";
  if (url.includes("ebay")) return "eBay";
  if (url.includes("shein")) return "SHEIN";
  if (url.includes("microcenter")) return "Microcenter";
  try {
    return new URL(order.product_url).hostname.replace(/^www\./, "");
  } catch {
    return "Store";
  }
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function OrderCard({ order }: { order: Order }) {
  const router = useRouter();
  const platform = getPlatformLabel(order);
  const brand = getBrandConfig(platform);
  const dateStr = DATE_FORMATTER.format(new Date(order.created_at));
  const total = (order.admin_total_ghs ?? order.pricing?.total_ghs ?? 0).toLocaleString(
    "en-GH",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/app/orders/${order.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/app/orders/${order.id}`);
      }}
      className="flex cursor-pointer items-center gap-3.5 rounded-2xl border border-stone-100 bg-white p-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-all duration-200 active:scale-[0.99] active:bg-stone-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 md:gap-7 md:p-5"
    >
      {/* Product image */}
      <div className="shrink-0 flex size-16 items-center justify-center overflow-hidden rounded-xl border border-stone-100 bg-stone-50 md:size-22">
        {order.product_image_url ? (
          <Image
            src={order.product_image_url}
            alt={order.product_name}
            width={100}
            height={100}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <ShoppingBagIcon className="size-6 text-stone-300" aria-hidden="true" />
        )}
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1 space-y-1.5 md:space-y-4">
        {/* Row 1: platform pill + mobile price */}
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${brand.pill}`}>
            {platform}
          </span>
          <span className="shrink-0 text-sm font-bold text-stone-900 md:hidden">
            GHS {total}
          </span>
        </div>

        {/* Row 2: product name */}
        <p className="line-clamp-1 text-[13px] font-semibold leading-snug text-stone-900 md:line-clamp-2 md:text-sm">
          {order.product_name}
        </p>

        {/* Row 3: status + date + desktop price */}
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <span className="text-[10px] text-stone-400">{dateStr}</span>
          <span className="ml-auto hidden text-sm font-bold text-stone-900 md:block">
            GHS {total}
          </span>
        </div>

        {/* Row 4: alert banners (conditional) */}
        {order.needs_review && order.status === "pending" ? (
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
            <AlertTriangleIcon className="size-3 shrink-0" aria-hidden="true" />
            Pending admin review
          </div>
        ) : order.tracking_number ? (
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600">
            <TruckIcon className="size-3 shrink-0" aria-hidden="true" />
            {order.tracking_number}
            {order.carrier && (
              <span className="font-normal text-indigo-400">via {order.carrier}</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Right: mobile chevron / desktop dropdown */}
      {/* stopPropagation so the dropdown doesn't also trigger card navigation */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <ArrowRightIcon className="size-4 text-stone-300 md:hidden" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="hidden md:flex size-9 cursor-pointer items-center justify-center rounded-xl border border-stone-200 text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
              aria-label="Order actions"
            >
              <MoreVerticalIcon className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl border border-stone-100 shadow-md">
            <DropdownMenuItem asChild>
              <Link
                href={`/app/orders/${order.id}`}
                className="flex cursor-pointer items-center gap-2 py-2"
              >
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={order.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex cursor-pointer items-center gap-2 py-2"
              >
                View product
                <ExternalLinkIcon className="size-4 text-stone-500" />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
