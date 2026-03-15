"use client";

import Link from "next/link";
import Image from "next/image";
import {
  PackageIcon,
  TruckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  ArrowRightIcon,
} from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import { Button } from "@/components/ui/button";
import type { Order } from "../types";
import { Item, ItemContent, ItemHeader } from "@/components/ui/item";

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  const formattedDate = new Date(order.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const totalGhs = (order.pricing?.total_ghs ?? 0).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
  });

  return (
    <Item className="rounded-xl overflow-hidden bg-white">

      {/* Header — hidden on mobile */}
      <ItemHeader className="hidden sm:flex items-center justify-between gap-4 px-5 py-3.5 border-b border-stone-100">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">Order Date</p>
            <p className="text-sm font-semibold text-stone-800">{formattedDate}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-0.5">Total</p>
            <p className="text-sm font-semibold text-stone-800">GHS {totalGhs}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <Button size="sm" asChild variant="outline" className="shadow-none shrink-0">
          <Link href={`/app/orders/${order.id}`}>View Order</Link>
        </Button>
      </ItemHeader>

      {/* Status banners */}
      {order.needs_review && order.status === "pending" ? (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          Pending admin review
        </div>
      ) : order.tracking_number ? (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 font-medium">
          <TruckIcon className="size-3.5 shrink-0" />
          Tracking: {order.tracking_number}
          {order.carrier && (
            <span className="text-indigo-400 font-normal">via {order.carrier}</span>
          )}
        </div>
      ) : null}

      {/* Product row */}
      <ItemContent className="flex flex-row gap-4 px-5 py-4">
        <div className="shrink-0 size-20 rounded-lg border border-stone-100 bg-stone-50 overflow-hidden flex items-center justify-center p-1.5">
          {order.product_image_url ? (
            <Image
              src={order.product_image_url}
              alt={order.product_name}
              width={80}
              height={80}
              className="object-contain w-full h-full"
            />
          ) : (
            <PackageIcon className="size-7 text-stone-300" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <p className="font-semibold text-stone-900 line-clamp-2 leading-snug text-sm">
            {order.product_name}
          </p>
          <div className="flex items-center gap-3">
            {/* Mobile: show status + view details */}
            <span className="sm:hidden">
              <OrderStatusBadge status={order.status} />
            </span>
            <Link
              href={`/app/orders/${order.id}`}
              className="sm:hidden flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 transition-colors font-medium"
            >
              <ArrowRightIcon className="size-3" />
              View details
            </Link>
            {/* Desktop: view product link */}
            <Link
              href={order.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs text-stone-400 hover:text-rose-500 transition-colors"
            >
              <ExternalLinkIcon className="size-3" />
              View Product
            </Link>
          </div>
        </div>
      </ItemContent>
    </Item>
  );
}
