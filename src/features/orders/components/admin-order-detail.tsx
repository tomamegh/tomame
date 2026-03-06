"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ExternalLinkIcon,
  PackageIcon,
  TruckIcon,
  ClipboardListIcon,
  UserIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  CircleIcon,
  ImageIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { OrderStatusBadge } from "./order-status-badge";
import { UserRoleBadge } from "@/features/users/components/user-role-badge";
import {
  useAdminOrderDetail,
  useReviewOrder,
  useOrderHistory,
} from "../hooks/useOrders";
import { useAdminUserDetail } from "@/features/users/hooks/useUsers";
import type { Order, OrderStatus, OriginCountry } from "../types";
import type { DbAuditLog } from "@/types/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Status timeline ───────────────────────────────────────────────────────────

const STATUS_SEQUENCE: { status: OrderStatus; label: string; description: string }[] = [
  { status: "pending",    label: "Order Placed",      description: "Awaiting payment" },
  { status: "paid",       label: "Payment Confirmed", description: "Payment received" },
  { status: "processing", label: "Processing",        description: "Sourcing the item" },
  { status: "in_transit", label: "In Transit",        description: "On its way" },
  { status: "delivered",  label: "Delivered",         description: "Package delivered" },
  { status: "completed",  label: "Completed",         description: "Order complete" },
];

function getTs(logs: DbAuditLog[], status: string): string | null {
  if (status === "pending") {
    return logs.find((l) => l.action === "order_created")?.created_at ?? null;
  }
  return (
    logs.find(
      (l) =>
        l.action === "order_status_changed" &&
        (l.metadata as Record<string, unknown>)?.to === status
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
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const isCancelled = currentStatus === "cancelled";
  const currentIndex = STATUS_SEQUENCE.findIndex((s) => s.status === currentStatus);
  const cancelLog = logs?.find(
    (l) =>
      (l.action === "order_status_changed" || l.action === "order_cancelled_by_user") &&
      (l.metadata as Record<string, unknown>)?.to === "cancelled"
  );

  return (
    <div>
      {STATUS_SEQUENCE.map((step, index) => {
        const ts = logs ? getTs(logs, step.status) : null;
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
            {cancelLog && (
              <p className="text-xs text-stone-400 mt-0.5">
                {fmtDateTime(cancelLog.created_at)}
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
    { label: "Shipping fee", value: `$${fmt(p.shipping_fee_usd)}` },
    {
      label: `Service fee (${(p.service_fee_percentage * 100).toFixed(0)}%)`,
      value: `$${fmt(p.service_fee_usd)}`,
    },
    { label: "Total (USD)", value: `$${fmt(p.total_usd)}`, bold: true },
    { label: "Exchange rate", value: `1 USD = ${p.exchange_rate} GHS` },
  ];

  return (
    <div className="space-y-2">
      {rows.map(({ label, value, bold }) => (
        <div
          key={label}
          className={`flex justify-between text-sm gap-4 ${
            bold
              ? "font-semibold text-stone-800 pt-2 border-t border-stone-100"
              : "text-stone-600"
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

// ── Review panel ──────────────────────────────────────────────────────────────

function ReviewPanel({ order }: { order: Order }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);

  // Approve fields
  const [productName, setProductName] = useState(order.productName);
  const [estimatedPriceUsd, setEstimatedPriceUsd] = useState(
    String(order.estimatedPriceUsd)
  );
  const [originCountry, setOriginCountry] = useState<OriginCountry>(order.originCountry);

  // Reject field
  const [rejectReason, setRejectReason] = useState("");

  const reviewMutation = useReviewOrder();

  if (order.reviewedBy) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2Icon className="size-4 shrink-0" />
        Reviewed on {order.reviewedAt ? fmtDate(order.reviewedAt) : "—"}
      </div>
    );
  }

  function handleApprove() {
    const price = parseFloat(estimatedPriceUsd);
    if (isNaN(price) || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    reviewMutation.mutate(
      {
        id: order.id,
        action: "approve",
        updates: {
          productName: productName !== order.productName ? productName : undefined,
          estimatedPriceUsd: price !== order.estimatedPriceUsd ? price : undefined,
          originCountry:
            originCountry !== order.originCountry ? originCountry : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Order approved");
          setMode(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function handleReject() {
    reviewMutation.mutate(
      {
        id: order.id,
        action: "reject",
        reason: rejectReason || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Order rejected and cancelled");
          setMode(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-700">
          <AlertTriangleIcon className="size-4" />
          Needs Review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Review reasons */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
            Flagged reasons
          </p>
          <ul className="space-y-1">
            {order.reviewReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangleIcon className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* Action buttons */}
        {mode === null && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setMode("approve")}
            >
              <CheckIcon className="size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => setMode("reject")}
            >
              <XIcon className="size-3.5" />
              Decline
            </Button>
          </div>
        )}

        {/* Approve form */}
        {mode === "approve" && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium text-stone-600">
              Optionally correct details before approving:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Product Name</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estimated Price (USD)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={estimatedPriceUsd}
                  onChange={(e) => setEstimatedPriceUsd(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Origin Country</Label>
                <Select
                  value={originCountry}
                  onValueChange={(v) => setOriginCountry(v as OriginCountry)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">🇺🇸 USA</SelectItem>
                    <SelectItem value="UK">🇬🇧 UK</SelectItem>
                    <SelectItem value="CHINA">🇨🇳 China</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={handleApprove}
                disabled={reviewMutation.isPending}
              >
                <CheckIcon className="size-3.5" />
                {reviewMutation.isPending ? "Approving..." : "Confirm Approval"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode(null)}
                disabled={reviewMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Reject form */}
        {mode === "reject" && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                placeholder="Why is this order being declined?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="text-sm resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={handleReject}
                disabled={reviewMutation.isPending}
              >
                <XIcon className="size-3.5" />
                {reviewMutation.isPending ? "Declining..." : "Confirm Decline"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode(null)}
                disabled={reviewMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── User card ─────────────────────────────────────────────────────────────────

function UserCard({ userId }: { userId: string }) {
  const { data, isLoading } = useAdminUserDetail(userId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserIcon className="size-4 text-stone-500" />
          Customer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : !data ? (
          <p className="text-stone-400 text-xs">Could not load user info</p>
        ) : (
          <>
            <div className="space-y-0.5">
              <p className="text-xs text-stone-400">Email</p>
              <Link
                href={`/admin/users/${userId}`}
                className="font-medium text-stone-800 hover:text-rose-600 hover:underline truncate block"
              >
                {data.user.email}
              </Link>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-stone-400">Role</p>
              <UserRoleBadge role={data.user.role} />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-stone-400">Member since</p>
              <p className="text-stone-700">{fmtDate(data.user.createdAt)}</p>
            </div>
            <div className="pt-1">
              <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                <Link href={`/admin/users/${userId}`}>View profile</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AdminOrderDetailProps {
  orderId: string;
}

export function AdminOrderDetail({ orderId }: AdminOrderDetailProps) {
  const { data: order, isPending, error } = useAdminOrderDetail(orderId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
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
    <div className="space-y-5">
      {/* ── Product card ──────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-start">
            <div className="shrink-0 size-20 sm:size-28 rounded-xl border border-stone-200/60 bg-stone-50 flex items-center justify-center overflow-hidden">
              {hasImage ? (
                <Image
                  src={order.productImageUrl!}
                  alt={order.productName}
                  width={112}
                  height={112}
                  className="w-full h-full object-contain p-1"
                  unoptimized
                />
              ) : (
                <ImageIcon className="size-8 text-stone-300" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 leading-snug text-lg">
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
                <div className="flex items-center gap-2 flex-wrap">
                  {order.needsReview && !order.reviewedBy && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full">
                      <AlertTriangleIcon className="size-3" />
                      Needs Review
                    </span>
                  )}
                  <OrderStatusBadge status={order.status} />
                </div>
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

          {/* Order ID */}
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs text-stone-400">
            <span>Order ID</span>
            <span className="font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
              {order.id}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Review panel (only when pending review) ────────────── */}
      {order.needsReview && <ReviewPanel order={order} />}

      {/* ── Main grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: timeline + pricing */}
        <div className="lg:col-span-2 space-y-5">
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

        {/* Right: customer + order metadata */}
        <div className="space-y-5">
          <UserCard userId={order.userId} />

          {/* Quick meta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-stone-500 font-medium">
                Order Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Status", <OrderStatusBadge key="s" status={order.status} />],
                ["Created", fmtDateTime(order.createdAt)],
                ["Updated", fmtDateTime(order.updatedAt)],
                ...(order.reviewedAt
                  ? [["Reviewed", fmtDateTime(order.reviewedAt)] as [string, React.ReactNode]]
                  : []),
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <span className="text-stone-400 shrink-0">{label}</span>
                  <span className="text-stone-700 text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Tracking card ──────────────────────────────────────── */}
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
                  <p className="text-xs text-stone-400 mb-0.5">Tracking #</p>
                  <p className="font-medium text-stone-800 font-mono text-xs">
                    {order.trackingNumber}
                  </p>
                </div>
              )}
              {order.estimatedDeliveryDate && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Est. Delivery</p>
                  <p className="font-medium text-stone-800">
                    {fmtDate(order.estimatedDeliveryDate)}
                  </p>
                </div>
              )}
              {order.deliveredAt && (
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Delivered At</p>
                  <p className="font-medium text-stone-800">
                    {fmtDateTime(order.deliveredAt)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
