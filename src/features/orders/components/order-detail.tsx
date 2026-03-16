"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ExternalLinkIcon,
  PackageIcon,
  TruckIcon,
  XCircleIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClipboardListIcon,
  ImageIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "./order-status-badge";
import { useOrder, useCancelOrder, useOrderHistory } from "../hooks/useOrders";
import type { Order, OrderStatus } from "../types";
import type { DbAuditLog } from "@/types/db";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const STATUS_SEQUENCE: { status: OrderStatus; label: string; description: string }[] = [
  { status: "pending",    label: "Order Placed",        description: "Awaiting payment" },
  { status: "paid",       label: "Payment Confirmed",   description: "Payment received" },
  { status: "processing", label: "Processing",          description: "Sourcing your item" },
  { status: "in_transit", label: "In Transit",          description: "On its way to you" },
  { status: "delivered",  label: "Delivered",           description: "Package delivered" },
  { status: "completed",  label: "Completed",           description: "Order complete" },
];

function getTimestamp(
  logs: DbAuditLog[],
  status: string,
): string | null {
  if (status === "pending") {
    return logs.find((l) => l.action === "order_created")?.created_at ?? null;
  }
  return (
    logs.find(
      (l) =>
        l.action === "order_status_changed" &&
        (l.metadata as Record<string, unknown>)?.to === status,
    )?.created_at ?? null
  );
}

function OrderTimeline({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const { data: logs, isPending } = useOrderHistory(orderId);

  if (isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-5 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const isCancelled = currentStatus === "cancelled";
  // For cancelled orders, find the last reached status from audit logs
  const lastReachedIndex = isCancelled
    ? STATUS_SEQUENCE.reduce((last, step, i) => {
        const ts = logs ? getTimestamp(logs, step.status) : null;
        return ts !== null ? i : last;
      }, -1)
    : STATUS_SEQUENCE.findIndex((s) => s.status === currentStatus);

  const cancellationLog = logs?.find(
    (l) =>
      (l.action === "order_status_changed" || l.action === "order_cancelled_by_user") &&
      (l.metadata as Record<string, unknown>)?.to === "cancelled",
  );

  return (
    <div className="space-y-0">
      {STATUS_SEQUENCE.map((step, index) => {
        const ts = logs ? getTimestamp(logs, step.status) : null;
        const isCompleted = ts !== null;
        const isCurrent = !isCancelled && step.status === currentStatus;
        // Steps after the last reached status on a cancelled order are "skipped"
        const isSkipped = isCancelled && index > lastReachedIndex;
        const isLast = index === STATUS_SEQUENCE.length - 1;

        const state: "completed" | "current" | "skipped" | "upcoming" = isSkipped
          ? "skipped"
          : isCompleted
          ? "completed"
          : isCurrent
          ? "current"
          : "upcoming";

        return (
          <div key={step.status} className={`flex gap-4 ${isSkipped ? "opacity-35" : ""}`}>
            <div className="flex flex-col items-center">
              {state === "completed" ? (
                <CheckCircle2Icon className="size-5 text-emerald-500 shrink-0" />
              ) : state === "current" ? (
                <div className="size-5 rounded-full bg-rose-500 shrink-0 flex items-center justify-center">
                  <div className="size-2 rounded-full bg-white" />
                </div>
              ) : (
                <CircleIcon className="size-5 text-stone-300 shrink-0" />
              )}
              {/* Always draw connector; last normal step connects to cancelled node */}
              {(!isLast || isCancelled) && (
                <div
                  className={`w-px flex-1 min-h-8 mt-1 ${
                    state === "completed" ? "bg-emerald-300" : "bg-stone-200"
                  }`}
                />
              )}
            </div>
            <div className="pb-6 min-w-0">
              <p
                className={`text-sm font-medium leading-5 ${
                  state === "upcoming" || state === "skipped" ? "text-stone-400" : "text-stone-800"
                }`}
              >
                {step.label}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{step.description}</p>
              {ts && (
                <p className="text-xs text-stone-400 mt-0.5">{fmtDateTime(ts)}</p>
              )}
            </div>
          </div>
        );
      })}

      {isCancelled && (
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <XCircleIcon className="size-5 text-red-500 shrink-0" />
          </div>
          <div className="pb-6">
            <p className="text-sm font-semibold text-red-600">Order Cancelled</p>
            <p className="text-xs text-stone-400 mt-0.5">This order was cancelled</p>
            {cancellationLog && (
              <p className="text-xs text-stone-400 mt-0.5">
                {fmtDateTime(cancellationLog.created_at)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pricing breakdown ─────────────────────────────────────────────────────────

function PricingBreakdown({ order }: { order: Order }) {
  const p = order.pricing;

  const rows =
    p.pricing_method === "fixed_freight"
      ? [
          { label: "Item price (USD)", value: `$${fmt(p.item_price_usd)}` },
          { label: `Qty × price (×${p.quantity})`, value: `$${fmt(p.subtotal_usd)}` },
          { label: "Int'l freight (incl. customs)", value: `GH₵ ${fmt(p.fixed_freight_ghs ?? 0)}` },
          { label: "Exchange rate", value: `1 USD = ${p.exchange_rate} GHS` },
        ]
      : [
          { label: "Item price (USD)", value: `$${fmt(p.item_price_usd)}` },
          { label: `Qty × price (×${p.quantity})`, value: `$${fmt(p.subtotal_usd)}` },
          { label: "Seller shipping", value: p.seller_shipping_usd ? `$${fmt(p.seller_shipping_usd)}` : "FREE" },
          { label: "Int'l freight (incl. customs)", value: `$${fmt(p.freight_usd ?? 0)}` },
          {
            label: `Service fee (${((p.service_fee_percentage ?? 0) * 100).toFixed(0)}%)`,
            value: `$${fmt(p.service_fee_usd ?? 0)}`,
          },
          { label: "Handling", value: `$${fmt(p.handling_fee_usd ?? 0)}` },
          { label: "Total (USD)", value: `$${fmt(p.total_usd ?? 0)}`, bold: true },
          { label: "Exchange rate", value: `1 USD = ${p.exchange_rate} GHS` },
        ];

  return (
    <div className="space-y-2">
      {rows.map(({ label, value, bold }) => (
        <div
          key={label}
          className={`flex justify-between text-sm gap-4 ${
            bold ? "font-semibold text-stone-800 pt-2 border-t border-stone-100" : "text-stone-600"
          }`}
        >
          <span>{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
      <div className="flex justify-between font-bold text-base text-stone-900 pt-2 border-t border-stone-200">
        <span>Total (GHS)</span>
        <span className="tabular-nums">
          {new Intl.NumberFormat("en-GH", {
            style: "currency",
            currency: "GHS",
            minimumFractionDigits: 2,
          }).format(p.total_ghs)}
        </span>
      </div>
    </div>
  );
}

// ── Cancel confirmation ───────────────────────────────────────────────────────

function CancelSection({ orderId }: { orderId: string }) {
  const [confirm, setConfirm] = useState(false);
  const cancelMutation = useCancelOrder();

  if (!confirm) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 border-red-200 hover:bg-red-50"
        onClick={() => setConfirm(true)}
      >
        Cancel Order
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-stone-600">Are you sure?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={cancelMutation.isPending}
        onClick={() =>
          cancelMutation.mutate(orderId, {
            onSuccess: () => setConfirm(false),
          })
        }
      >
        {cancelMutation.isPending ? "Cancelling…" : "Yes, cancel"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Keep order
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface OrderDetailProps {
  orderId: string;
  /** Pass true when rendered in the admin context — hides cancel button */
  isAdmin?: boolean;
}

export function OrderDetail({ orderId, isAdmin }: OrderDetailProps) {
  const { data: order, isPending, error, refetch } = useOrder(orderId);

  if (isPending) {
    return (
      <div className="space-y-4">
        {/* Product info card skeleton */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4 items-start">
              <Skeleton className="shrink-0 size-20 sm:size-28 rounded-xl" />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline + Pricing skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="size-5 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1 pb-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-36" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-stone-100">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <Empty className="bg-white">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShoppingCartIcon />
        </EmptyMedia>
        <EmptyTitle>{error.message || 'Something might have happened'}</EmptyTitle>
        <EmptyDescription>
          We could not find any order with this associated Id.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={()=>refetch()} variant="primary" size="sm" className="px-5">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
    );
  }

  const hasImage = !!order.product_image_url;
  const hasTracking =
    order.tracking_number || order.carrier || order.estimated_delivery_date;

  return (
    <div className="space-y-4">
      {/* Product info card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-start">
            {/* Product image */}
            <div className="shrink-0 size-20 sm:size-28 rounded-xl border border-stone-200/60 bg-stone-50 flex items-center justify-center overflow-hidden">
              {hasImage ? (
                <Image
                  src={order.product_image_url!}
                  alt={order.product_name}
                  width={112}
                  height={112}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="size-8 text-stone-300" />
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 leading-snug line-clamp-2">
                    {order.product_name}
                  </p>
                  <a
                    href={order.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-rose-500 hover:underline mt-0.5"
                  >
                    <ExternalLinkIcon className="size-3" />
                    View product
                  </a>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-4 text-sm">
                {[
                  ["Origin", order.origin_country],
                  ["Qty", String(order.quantity)],
                  ["Est. price", `$${fmt(order.estimated_price_usd)}`],
                  ["Placed", fmtDate(order.created_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-stone-400">{label}</p>
                    <p className="font-medium text-stone-800">{value}</p>
                  </div>
                ))}
              </div>

              {order.special_instructions && (
                <div className="mt-3 rounded-lg bg-stone-50 border border-stone-100 px-3 py-2 text-xs text-stone-600">
                  <span className="font-medium text-stone-700">Notes: </span>
                  {order.special_instructions}
                </div>
              )}
            </div>
          </div>

          {/* Cancel */}
          {!isAdmin && order.status === "pending" && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <CancelSection orderId={orderId} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timeline */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageIcon className="size-4 text-stone-500" />
              Order Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTimeline orderId={orderId} currentStatus={order.status} />
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardListIcon className="size-4 text-stone-500" />
              Pricing Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PricingBreakdown order={order} />
          </CardContent>
        </Card>
      </div>

      {/* Tracking info (only when available) */}
      {hasTracking && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TruckIcon className="size-4 text-stone-500" />
              Tracking Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {order.carrier && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Carrier</p>
                  <p className="font-medium text-stone-800">{order.carrier}</p>
                </div>
              )}
              {order.tracking_number && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Tracking number</p>
                  <p className="font-medium text-stone-800 font-mono text-xs">
                    {order.tracking_number}
                  </p>
                </div>
              )}
              {order.estimated_delivery_date && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Estimated delivery</p>
                  <p className="font-medium text-stone-800">
                    {fmtDate(order.estimated_delivery_date)}
                  </p>
                </div>
              )}
              {order.delivered_at && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Delivered at</p>
                  <p className="font-medium text-stone-800">
                    {fmtDateTime(order.delivered_at)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin link */}
      {!isAdmin && (
        <p className="text-xs text-center text-stone-400">
          Order ID:{" "}
          <span className="font-mono">{orderId}</span>
        </p>
      )}
    </div>
  );
}
