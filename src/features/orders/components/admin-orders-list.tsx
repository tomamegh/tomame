"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLinkIcon } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import { useAdminOrders, useUpdateOrderStatus } from "../hooks/useOrders";
import type { OrderStatus } from "../types";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["completed"],
};

export function AdminOrdersList() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isPending, error } = useAdminOrders(
    statusFilter ? { status: statusFilter } : undefined
  );
  const { mutateAsync: updateStatus, isPending: isUpdating } = useUpdateOrderStatus();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateStatus({ id: orderId, status: newStatus });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-stone-400">
          {data?.count ?? 0} orders
        </span>
      </div>

      {isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error.message}
        </div>
      )}

      {data?.orders.map((order) => {
        const nextOptions = NEXT_STATUS[order.status as OrderStatus] ?? [];
        return (
          <Card key={order.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-800 truncate">
                    {order.productName}
                  </p>
                  <a
                    href={order.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-rose-500 hover:underline flex items-center gap-1"
                  >
                    <ExternalLinkIcon className="w-3 h-3" />
                    <span className="truncate max-w-xs">{order.productUrl}</span>
                  </a>
                  <p className="text-xs text-stone-400 mt-1">
                    {order.originCountry} · Qty {order.quantity} · GHS{" "}
                    {order.pricing.total_ghs.toFixed(2)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <OrderStatusBadge status={order.status as OrderStatus} />
                  {nextOptions.length > 0 && (
                    <div className="flex gap-2">
                      {nextOptions.map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant="outline"
                          disabled={isUpdating && updatingId === order.id}
                          onClick={() => handleStatusChange(order.id, next)}
                        >
                          {updatingId === order.id ? "..." : `→ ${next}`}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {data?.orders.length === 0 && !isPending && (
        <p className="text-center text-stone-400 py-10">No orders found</p>
      )}
    </div>
  );
}
