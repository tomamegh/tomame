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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "./order-status-badge";
import { useOrder, useCancelOrder, useOrderHistory } from "../hooks/useOrders";
import type { Order, OrderStatus } from "../types";
import type { DbAuditLog } from "@/types/db";

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
  const currentIndex = STATUS_SEQUENCE.findIndex((s) => s.status === currentStatus);

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
        const isCurrent = step.status === currentStatus;
        const isReachable = !isCancelled || index <= currentIndex;

        if (!isReachable) return null;

        const state: "completed" | "current" | "upcoming" =
          isCompleted ? "completed" : isCurrent ? "current" : "upcoming";
        const isLast = index === STATUS_SEQUENCE.length - 1 && !isCancelled;

        return (
          <div key={step.status} className="flex gap-4">
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
              {!isLast && (
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
                  state === "upcoming" ? "text-stone-400" : "text-stone-800"
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
            <p className="text-sm font-medium text-red-600">Cancelled</p>
            <p className="text-xs text-stone-400 mt-0.5">Order was cancelled</p>
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

  const rows = [
    { label: "Item price (USD)", value: `$${fmt(p.item_price_usd)}` },
    { label: `Qty × price (×${p.quantity})`, value: `$${fmt(p.subtotal_usd)}` },
    { label: "Seller shipping", value: p.seller_shipping_usd ? `$${fmt(p.seller_shipping_usd)}` : "FREE" },
    { label: "International freight (incl. customs)", value: `$${fmt(p.freight_usd)}` },
    {
      label: `Service fee (${(p.service_fee_percentage * 100).toFixed(0)}%)`,
      value: `$${fmt(p.service_fee_usd)}`,
    },
    { label: "Handling", value: `$${fmt(p.handling_fee_usd)}` },
    { label: "Total (USD)", value: `$${fmt(p.total_usd)}`, bold: true },
    { label: "Exchange rate", value: `1 USD = GH₵ ${p.exchange_rate}` },
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
  const { data: order, isPending, error } = useOrder(orderId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error?.message ?? "Order not found"}
      </div>
    );
  }

  const hasImage = !!order.productImageUrl;
  const hasTracking =
    order.trackingNumber || order.carrier || order.estimatedDeliveryDate;

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
                  src={order.productImageUrl!}
                  alt={order.productName}
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
                    {order.productName}
                  </p>
                  <a
                    href={order.productUrl}
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
                  ["Origin", order.originCountry],
                  ["Qty", String(order.quantity)],
                  ["Est. price", `$${fmt(order.estimatedPriceUsd)}`],
                  ["Placed", fmtDate(order.createdAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-stone-400">{label}</p>
                    <p className="font-medium text-stone-800">{value}</p>
                  </div>
                ))}
              </div>

              {order.specialInstructions && (
                <div className="mt-3 rounded-lg bg-stone-50 border border-stone-100 px-3 py-2 text-xs text-stone-600">
                  <span className="font-medium text-stone-700">Notes: </span>
                  {order.specialInstructions}
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
              {order.trackingNumber && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Tracking number</p>
                  <p className="font-medium text-stone-800 font-mono text-xs">
                    {order.trackingNumber}
                  </p>
                </div>
              )}
              {order.estimatedDeliveryDate && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Estimated delivery</p>
                  <p className="font-medium text-stone-800">
                    {fmtDate(order.estimatedDeliveryDate)}
                  </p>
                </div>
              )}
              {order.deliveredAt && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Delivered at</p>
                  <p className="font-medium text-stone-800">
                    {fmtDateTime(order.deliveredAt)}
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
