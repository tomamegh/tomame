"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OrderStatusBadge } from "./order-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrder } from "../hooks/useOrders";

interface OrderDetailProps {
  orderId: string;
}

export function OrderDetail({ orderId }: OrderDetailProps) {
  const { data: order, isPending, error } = useOrder(orderId);

  if (isPending) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (error || !order) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        {error?.message ?? "Order not found"}
      </div>
    );
  }

  const p = order.pricing;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-800">{order.productName}</h2>
              <a
                href={order.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-rose-500 hover:underline flex items-center gap-1 mt-1"
              >
                <ExternalLinkIcon className="w-3 h-3" />
                View product
              </a>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-stone-400">Origin</p>
              <p className="font-medium text-stone-800">{order.originCountry}</p>
            </div>
            <div>
              <p className="text-stone-400">Quantity</p>
              <p className="font-medium text-stone-800">{order.quantity}</p>
            </div>
            <div>
              <p className="text-stone-400">Est. Price</p>
              <p className="font-medium text-stone-800">${order.estimatedPriceUsd.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-stone-400">Ordered</p>
              <p className="font-medium text-stone-800">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {order.specialInstructions && (
            <div className="p-3 bg-stone-50 rounded-xl text-sm text-stone-600">
              <p className="font-medium text-stone-700 mb-1">Special Instructions</p>
              {order.specialInstructions}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-stone-800">Pricing Breakdown</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              ["Item price", `$${p.item_price_usd.toFixed(2)}`],
              ["Qty × price", `$${p.subtotal_usd.toFixed(2)}`],
              ["Shipping fee", `$${p.shipping_fee_usd.toFixed(2)}`],
              [`Service fee (${(p.service_fee_percentage * 100).toFixed(0)}%)`, `$${p.service_fee_usd.toFixed(2)}`],
              ["Total (USD)", `$${p.total_usd.toFixed(2)}`],
              ["Exchange rate", `1 USD = ${p.exchange_rate} GHS`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-stone-600">
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-stone-800 pt-2 border-t border-stone-100">
              <span>Total (GHS)</span>
              <span>GHS {p.total_ghs.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
