"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptIcon } from "lucide-react";
import { useAdminTransactions } from "../hooks/useTransactions";
import { TransactionItem } from "./transaction-item";

export function AdminTransactionsList() {
  const [status, setStatus] = useState("");

  const { data, isPending, error } = useAdminTransactions(
    status ? { status } : undefined
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-stone-400">{data?.count ?? 0} total</span>
      </div>

      {isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error.message}
        </div>
      )}

      {!isPending && data?.transactions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-stone-400">
          <ReceiptIcon className="w-10 h-10" />
          <p className="text-sm">No transactions found</p>
        </div>
      )}

      {data?.transactions.map((t) => (
        <TransactionItem key={t.id} transaction={t} />
      ))}
    </div>
  );
}
