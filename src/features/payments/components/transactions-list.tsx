"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptIcon } from "lucide-react";
import { useTransactions } from "../hooks/useTransactions";
import { TransactionItem } from "./transaction-item";

export function TransactionsList() {
  const { data, isPending, error } = useTransactions();

  if (isPending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        {error.message}
      </div>
    );
  }

  if (!data?.transactions.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-stone-400">
        <ReceiptIcon className="w-10 h-10" />
        <p className="text-sm">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.transactions.map((t) => (
        <TransactionItem key={t.id} transaction={t} />
      ))}
    </div>
  );
}
