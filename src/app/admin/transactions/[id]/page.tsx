"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  PackageIcon,
  UserIcon,
  ExternalLinkIcon,
  CopyIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TransactionStatusBadge } from "@/features/transactions/components/transaction-status-badge";
import { useAdminTransaction, useSyncTransaction } from "@/features/transactions/hooks/useTransactions";
import { toast } from "@/lib/sonner";
import TransactionChannelBadge from "@/features/transactions/components/transaction-channel-badge";

interface Props {
  params: Promise<{ id: string }>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-stone-100 last:border-0">
      <span className="text-sm text-stone-500 shrink-0 w-36">{label}</span>
      <div className="text-sm text-stone-800 text-right">{children}</div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success({ title: "Copied to clipboard" });
      }}
      className="ml-1.5 text-stone-400 hover:text-stone-600 transition-colors inline-flex"
    >
      <CopyIcon className="size-3.5" />
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: txn, isLoading, error } = useAdminTransaction(id);
  const { mutate: syncStatus, isPending: isSyncing } = useSyncTransaction(id);

  const handleSync = () => {
    syncStatus(undefined, {
      onSuccess: (result) => {
        if (result.updated) {
          toast.success({ title: "Transaction synced", description: result.message });
        } else {
          toast.info({ title: "Already up to date", description: result.message });
        }
      },
      onError: (err) => {
        toast.error({ title: "Sync failed", description: err.message });
      },
    });
  };

  const fmtGhs = (n: number) =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/admin/transactions" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600">
          <ArrowLeftIcon className="size-4" />
          Back to transactions
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error.message}
        </div>
      </div>
    );
  }

  const paidAt = txn?.paystack_data?.paid_at as string | null | undefined;
  const paystackEmail = (txn?.paystack_data?.customer as { email?: string } | null)?.email;
  const paystackId = txn?.paystack_data?.id as number | null | undefined;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/admin/transactions"
        className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600"
      >
        <ArrowLeftIcon className="size-4" />
        Back to transactions
      </Link>

      {/* ── Header card ──────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0 gap-0">
        <div
          className="h-1.5 bg-linear-to-r from-stone-300 to-stone-400 data-[status=success]:from-emerald-400 data-[status=success]:to-green-500 data-[status=failed]:from-rose-400 data-[status=failed]:to-red-500"
          data-status={txn?.status}
        />
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {isLoading ? (
            <>
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">
                  Transaction
                </p>
                <h1 className="text-xl font-bold text-stone-900 font-mono">
                  {txn!.reference}
                </h1>
                <p className="text-xs text-stone-400 mt-0.5">
                  ID: {txn!.id}
                  <CopyButton value={txn!.id} />
                </p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                <div className="flex items-center gap-2">
                  <TransactionStatusBadge status={txn!.status} />
                  {txn!.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleSync}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <>Syncing <Spinner className="size-3" /></>
                      ) : (
                        "Sync with Paystack"
                      )}
                    </Button>
                  )}
                </div>
                <p className="text-3xl font-bold text-stone-900 tabular-nums">
                  {fmtGhs(txn!.amount_ghs)}
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── Details + Customer grid ───────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Payment details */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-700">Payment Details</h2>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-4 py-3 border-b border-stone-100 last:border-0">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <DetailRow label="Reference">
                  <span className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded">
                    {txn!.reference}
                  </span>
                  <CopyButton value={txn!.reference} />
                </DetailRow>
                <DetailRow label="Status">
                  <TransactionStatusBadge status={txn!.status} />
                </DetailRow>
                <DetailRow label="Channel">
                  <TransactionChannelBadge channel={txn!.channel} />
                </DetailRow>
                <DetailRow label="Amount">
                  <span className="font-semibold">{fmtGhs(txn!.amount_ghs)}</span>
                </DetailRow>
                <DetailRow label="Currency">
                  <span className="uppercase">{txn!.currency}</span>
                </DetailRow>
                <DetailRow label="Initiated">
                  {fmtDate(txn!.created_at)}
                </DetailRow>
                {paidAt && (
                  <DetailRow label="Paid at">{fmtDate(paidAt)}</DetailRow>
                )}
                {paystackId && (
                  <DetailRow label="Paystack ID">
                    <span className="font-mono text-xs">{paystackId}</span>
                  </DetailRow>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Customer */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-700">Customer</h2>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <div className="space-y-1">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex justify-between gap-4 py-3 border-b border-stone-100 last:border-0">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  ))}
                </div>
              </>
            ) : txn!.customer ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                    <UserIcon className="size-5 text-stone-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-800">
                      {txn!.customer.profile.first_name || txn!.customer.profile.last_name
                        ? `${txn!.customer.profile.first_name ?? ""} ${txn!.customer.profile.last_name ?? ""}`.trim()
                        : "—"}
                    </p>
                    <p className="text-xs text-stone-400 truncate">{txn!.customer.email}</p>
                  </div>
                </div>
                <DetailRow label="User ID">
                  <span className="font-mono text-xs">{txn!.customer.id.slice(0, 16)}…</span>
                  <CopyButton value={txn!.customer.id} />
                </DetailRow>
                {paystackEmail && paystackEmail !== txn!.customer.email && (
                  <DetailRow label="Paystack email">
                    <span className="text-xs">{paystackEmail}</span>
                  </DetailRow>
                )}
                <DetailRow label="View profile">
                  <Link
                    href={`/admin/users/${txn!.customer.id}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                  >
                    Open profile
                    <ExternalLinkIcon className="size-3" />
                  </Link>
                </DetailRow>
              </>
            ) : (
              <p className="text-sm text-stone-400">Customer not found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Linked order ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-700">Linked Order</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
            </div>
          ) : txn!.order ? (
            <div className="flex items-center gap-4">
              {txn!.order.product_image_url ? (
                <div className="relative size-14 shrink-0 rounded-lg overflow-hidden border border-stone-200">
                  <Image
                    src={txn!.order.product_image_url}
                    alt={txn!.order.product_name}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="size-14 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                  <PackageIcon className="size-6 text-stone-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
                  {txn!.order.origin_country} · Qty {txn!.order.quantity}
                </p>
                <p className="text-sm font-semibold text-stone-800 line-clamp-1">
                  {txn!.order.product_name}
                </p>
                <p className="text-xs text-stone-400 font-mono mt-0.5">{txn!.order.id}</p>
              </div>
              <Link
                href={`/admin/orders/${txn!.order.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 border border-stone-200 rounded-lg px-3 py-1.5 shrink-0"
              >
                View order
                <ExternalLinkIcon className="size-3" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-stone-400">No linked order.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Paystack verification data ────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-700">Paystack Verification Data</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-3/4" : "w-2/3"}`} />
              ))}
            </div>
          ) : txn!.paystack_data ? (
            <pre className="text-xs bg-stone-50 rounded-lg border border-stone-200 p-4 overflow-x-auto text-stone-600 leading-relaxed">
              {JSON.stringify(txn!.paystack_data, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-stone-400">No verification data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
