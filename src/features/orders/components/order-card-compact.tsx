"use client";

import Link from "next/link";
import Image from "next/image";
import { PackageIcon, ArrowRightIcon } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import type { Order } from "../types";

interface OrderCardCompactProps {
  order: Order;
}

export function OrderCardCompact({ order }: OrderCardCompactProps) {
  const formattedDate = new Date(order.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const totalGhs = (order.pricing?.total_ghs ?? 0).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
  });

  return (
    <Item variant="outline" className="rounded-xl bg-white hover:bg-stone-50 transition-colors">
      <ItemMedia variant="image" className="size-12 sm:size-14 rounded-lg border border-stone-100 bg-stone-50">
        {order.product_image_url ? (
          <Image
            src={order.product_image_url}
            alt={order.product_name}
            width={56}
            height={56}
            className="object-contain p-1"
          />
        ) : (
          <PackageIcon className="size-5 text-stone-300" />
        )}
      </ItemMedia>

      <ItemContent className="min-w-0">
        <ItemTitle className="text-stone-900 line-clamp-1 text-sm">
          {order.product_name}
        </ItemTitle>
        <ItemDescription className="text-xs text-stone-400 line-clamp-1">
          {formattedDate} &middot; GHS {totalGhs}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="shrink-0 flex-col sm:flex-row items-end sm:items-center gap-2">
        <OrderStatusBadge status={order.status} />
        <Link
          href={`/app/orders/${order.id}`}
          className="flex items-center gap-0.5 text-xs text-stone-400 hover:text-rose-500 transition-colors"
          aria-label="View order details"
        >
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </ItemActions>
    </Item>
  );
}
