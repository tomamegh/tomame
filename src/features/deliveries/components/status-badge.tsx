import { Badge } from "@/components/ui/badge";
import type { DeliveryStatus } from "../types";

const CONFIG: Record<DeliveryStatus, { label: string; className: string }> = {
  processing: {
    label: "Processing",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  in_transit: {
    label: "In Transit",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  delivered: {
    label: "Delivered",
    className: "bg-teal-50 text-teal-700 border-teal-200",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const config = CONFIG[status] ?? { label: status, className: "" };
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium ${config.className}`}
    >
      {config.label}
    </Badge>
  );
}
