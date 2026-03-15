"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
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
import { DeliveryStatusBadge } from "@/features/deliveries/components/status-badge";
import type { DeliveryStatus } from "@/features/deliveries/types";
import type { DashboardLatestDelivery } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface LatestDeliveriesTableProps {
  deliveries?: DashboardLatestDelivery[];
  isLoading: boolean;
}

export function LatestDeliveriesTable({
  deliveries,
  isLoading,
}: LatestDeliveriesTableProps) {
  return (
    <Card className="soft-shadow border-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Deliveries</CardTitle>
          <Link
            href="/admin/deliveries"
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
              <TableHead className="pl-6">Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Tracking #</TableHead>
              <TableHead className="text-right pr-6">Est. Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !deliveries?.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-stone-400 py-10 text-sm"
                >
                  No deliveries yet
                </TableCell>
              </TableRow>
            ) : (
              deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-6">
                    <div className="space-y-0.5">
                      <Link
                        href={`/admin/orders/${d.id}`}
                        className="font-medium text-stone-800 text-sm hover:text-rose-600 hover:underline line-clamp-1 max-w-45 block"
                      >
                        {d.productName}
                      </Link>
                      <p className="text-xs text-stone-400 font-mono">
                        #{d.id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DeliveryStatusBadge status={d.status as DeliveryStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-stone-600">
                    {d.carrier ?? <span className="text-stone-300">—</span>}
                  </TableCell>
                  <TableCell>
                    {d.trackingNumber ? (
                      <span className="font-mono text-xs text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                        {d.trackingNumber}
                      </span>
                    ) : (
                      <span className="text-stone-300 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-stone-500 pr-6">
                    {d.estimatedDeliveryDate
                      ? formatDate(d.estimatedDeliveryDate)
                      : <span className="text-stone-300">—</span>}
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
