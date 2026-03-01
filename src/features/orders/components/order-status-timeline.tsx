"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { useOrderHistory } from "../hooks/useOrders";
import type { OrderStatus } from "../types";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_SEQUENCE: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Order Placed" },
  { status: "paid", label: "Payment Confirmed" },
  { status: "processing", label: "Processing" },
  { status: "in_transit", label: "In Transit" },
  { status: "delivered", label: "Delivered" },
  { status: "completed", label: "Completed" },
];

function getStatusTimestamp(
  logs: { action: string; metadata: Record<string, unknown> | null; created_at: string }[],
  status: string,
): string | null {
  // Find the audit log where the order transitioned TO this status
  if (status === "pending") {
    const created = logs.find((l) => l.action === "order_created");
    return created?.created_at ?? null;
  }
  const entry = logs.find(
    (l) =>
      l.action === "order_status_changed" &&
      (l.metadata as Record<string, unknown>)?.to === status,
  );
  return entry?.created_at ?? null;
}

interface OrderStatusTimelineProps {
  orderId: string;
  currentStatus: OrderStatus;
}

export function OrderStatusTimeline({ orderId, currentStatus }: OrderStatusTimelineProps) {
  const { data: logs, isPending } = useOrderHistory(orderId);

  if (isPending) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  const isCancelled = currentStatus === "cancelled";
  const cancellationLog = logs?.find(
    (l) =>
      (l.action === "order_status_changed" || l.action === "order_cancelled_by_user") &&
      ((l.metadata as Record<string, unknown>)?.to === "cancelled"),
  );

  // Determine the index of the current status in the sequence
  const currentIndex = STATUS_SEQUENCE.findIndex((s) => s.status === currentStatus);

  return (
    <div className="space-y-0">
      {STATUS_SEQUENCE.map((step, index) => {
        const timestamp = logs ? getStatusTimestamp(logs, step.status) : null;
        const isCompleted = timestamp !== null;
        const isCurrent = step.status === currentStatus;
        // If order is cancelled, show steps up to where it was cancelled
        const isReachable = !isCancelled || index <= currentIndex;

        if (!isReachable && !isCancelled) {
          // Future step
          return (
            <TimelineStep
              key={step.status}
              label={step.label}
              timestamp={null}
              state="upcoming"
              isLast={index === STATUS_SEQUENCE.length - 1}
            />
          );
        }

        if (!isReachable) return null;

        return (
          <TimelineStep
            key={step.status}
            label={step.label}
            timestamp={timestamp}
            state={isCurrent ? "current" : isCompleted ? "completed" : "upcoming"}
            isLast={index === STATUS_SEQUENCE.length - 1 && !isCancelled}
          />
        );
      })}
      {isCancelled && (
        <TimelineStep
          label="Cancelled"
          timestamp={cancellationLog?.created_at ?? null}
          state="cancelled"
          isLast
        />
      )}
    </div>
  );
}

function TimelineStep({
  label,
  timestamp,
  state,
  isLast,
}: {
  label: string;
  timestamp: string | null;
  state: "completed" | "current" | "upcoming" | "cancelled";
  isLast: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        {state === "completed" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        )}
        {state === "current" && (
          <Circle className="w-5 h-5 text-rose-500 fill-rose-500 shrink-0" />
        )}
        {state === "upcoming" && (
          <Circle className="w-5 h-5 text-stone-300 shrink-0" />
        )}
        {state === "cancelled" && (
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
        )}
        {!isLast && (
          <div
            className={`w-px flex-1 min-h-[24px] ${
              state === "completed" ? "bg-emerald-300" : "bg-stone-200"
            }`}
          />
        )}
      </div>
      <div className="pb-6">
        <p
          className={`text-sm font-medium ${
            state === "upcoming"
              ? "text-stone-400"
              : state === "cancelled"
                ? "text-red-600"
                : "text-stone-800"
          }`}
        >
          {label}
        </p>
        {timestamp && (
          <p className="text-xs text-stone-400 mt-0.5">
            {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
