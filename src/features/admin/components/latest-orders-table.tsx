"use client";

import Link from "next/link";
import { ExternalLinkIcon, AlertTriangleIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import type { DashboardLatestOrder } from "../types";
import type { OrderStatus } from "@/features/orders/types";

const COUNTRY_FLAGS: Record<string, string> = {
  USA: "🇺🇸",
  UK: "🇬🇧",
  CHINA: "🇨🇳",
};

function formatGhs(v: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface LatestOrdersTableProps {
  orders?: DashboardLatestOrder[];
  isLoading: boolean;
}

export function LatestOrdersTable({ orders, isLoading }: LatestOrdersTableProps) {
  return (
    <Card className="soft-shadow border-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Latest Orders</CardTitle>
          <Link
            href="/admin/orders"
            className="text-xs text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1"
          >
            View all
            <ExternalLinkIcon className="size-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ships from</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right pr-6">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !orders?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-stone-400 py-10 text-sm">
                  No orders yet
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="pl-6">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-medium text-stone-800 text-sm hover:text-rose-600 hover:underline line-clamp-1 max-w-55"
                        >
                          {order.productName}
                        </Link>
                        {order.needsReview && (
                          <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-500" />
                        )}
                      </div>
                      <p className="text-xs text-stone-400 font-mono">
                        #{order.id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">
                    {COUNTRY_FLAGS[order.originCountry] ?? ""} {order.originCountry}
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">
                    {order.quantity}
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm text-stone-800">
                    {order.totalGhs != null ? formatGhs(order.totalGhs) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-stone-500 pr-6">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
