"use client";

import { useState } from "react";
import { ExternalLinkIcon, PackageIcon, TruckIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderStatusTimeline } from "./order-status-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrder, useCancelOrder } from "../hooks/useOrders";

interface OrderDetailProps {
  orderId: string;
}

export function OrderDetail({ orderId }: OrderDetailProps) {
  const { data: order, isPending, error } = useOrder(orderId);
  const cancelMutation = useCancelOrder();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
  const hasTracking = order.trackingNumber || order.carrier || order.estimatedDeliveryDate;

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

          {order.status === "pending" && (
            <div className="pt-2">
              {!showCancelConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel Order
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-600">Cancel this order?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(orderId, {
                      onSuccess: () => setShowCancelConfirm(false),
                    })}
                  >
                    {cancelMutation.isPending ? "Cancelling..." : "Yes, cancel"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    No, keep it
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {hasTracking && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-stone-800 flex items-center gap-2">
              <TruckIcon className="w-4 h-4" />
              Tracking Information
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {order.carrier && (
                <div>
                  <p className="text-stone-400">Carrier</p>
                  <p className="font-medium text-stone-800">{order.carrier}</p>
                </div>
              )}
              {order.trackingNumber && (
                <div>
                  <p className="text-stone-400">Tracking Number</p>
                  <p className="font-medium text-stone-800">{order.trackingNumber}</p>
                </div>
              )}
              {order.estimatedDeliveryDate && (
                <div>
                  <p className="text-stone-400">Estimated Delivery</p>
                  <p className="font-medium text-stone-800">
                    {new Date(order.estimatedDeliveryDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {order.deliveredAt && (
                <div>
                  <p className="text-stone-400">Delivered At</p>
                  <p className="font-medium text-stone-800">
                    {new Date(order.deliveredAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-stone-800 flex items-center gap-2">
            <PackageIcon className="w-4 h-4" />
            Order Timeline
          </h3>
        </CardHeader>
        <CardContent>
          <OrderStatusTimeline orderId={orderId} currentStatus={order.status} />
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
