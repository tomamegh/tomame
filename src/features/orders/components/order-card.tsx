"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OrderStatusBadge } from "./order-status-badge";
import type { Order } from "../types";

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-stone-800 truncate">
                {order.productName}
              </p>
              <span className="text-xs text-stone-400 shrink-0">
                {order.originCountry}
              </span>
            </div>
            <a
              href={order.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rose-500 hover:underline flex items-center gap-1 truncate"
            >
              <ExternalLinkIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{order.productUrl}</span>
            </a>
            <p className="text-xs text-stone-400 mt-1">
              Qty: {order.quantity} · Est. ${order.estimatedPriceUsd.toFixed(2)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <OrderStatusBadge status={order.status} />
            <p className="font-bold text-stone-800">
              GHS {order.pricing.total_ghs.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
          <p className="text-xs text-stone-400">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
          <Link
            href={`/app/orders/${order.id}`}
            className="text-xs text-rose-500 hover:underline font-medium"
          >
            View details →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
