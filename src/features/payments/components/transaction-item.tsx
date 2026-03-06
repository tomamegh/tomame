import { CreditCardIcon } from "lucide-react";
import type { Transaction } from "../types";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700" },
  success: { label: "Success", className: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700" },
};

interface TransactionItemProps {
  transaction: Transaction;
}

export function TransactionItem({ transaction }: TransactionItemProps) {
  const config = statusConfig[transaction.status] ?? statusConfig.pending;
  const amountGhs = (transaction.amount / 100).toFixed(2);

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-stone-100 hover:shadow-sm transition-shadow">
      <div className="p-2 bg-stone-50 rounded-lg shrink-0">
        <CreditCardIcon className="w-4 h-4 text-stone-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">
          {transaction.reference}
        </p>
        <p className="text-xs text-stone-400">
          {new Date(transaction.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="font-semibold text-stone-800">
          {transaction.currency} {amountGhs}
        </p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.className}`}>
          {config.label}
        </span>
      </div>
    </div>
  );
}
