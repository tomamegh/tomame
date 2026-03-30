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
import { Spinner } from "@/components/ui/spinner";
import { TransactionStatusBadge } from "@/features/transactions/components/transaction-status-badge";
import type { TransactionStatus } from "@/features/transactions/types";
import type { DashboardLatestTransaction } from "../types";

function formatGhs(v: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface LatestTransactionsTableProps {
  transactions?: DashboardLatestTransaction[];
  isLoading: boolean;
}

export function LatestTransactionsTable({
  transactions,
  isLoading,
}: LatestTransactionsTableProps) {
  return (
    <Card className="soft-shadow border-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Transactions</CardTitle>
          <Link
            href="/admin/transactions"
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
              <TableHead className="pl-6">Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right pr-6">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32">
                  <div className="flex items-center justify-center gap-2 text-stone-400 text-sm">
                    <Spinner className="size-4" />
                    <span>Loading…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : !transactions?.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-stone-400 py-10 text-sm"
                >
                  No transactions yet
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-6">
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded">
                        {t.reference}
                      </span>
                      <p className="text-xs text-stone-400 font-mono mt-0.5">
                        #{t.id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TransactionStatusBadge
                      status={t.status as TransactionStatus}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm text-stone-800">
                    {formatGhs(t.amountGhs)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-stone-500 pr-6">
                    {formatDate(t.createdAt)}
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
