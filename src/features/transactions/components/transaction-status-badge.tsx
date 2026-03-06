import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "../types";

const CONFIG: Record<TransactionStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  success: {
    label: "Success",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
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
