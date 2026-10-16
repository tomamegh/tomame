"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/ssr";

import { AdminBadge, AdminButton, AdminConfirm, AdminInput } from "@/components/layout/admin";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import type { ApiSuccessResponse } from "@/types/api";
import { channelLabel, formatDateTime, formatPesewas, transactionStatusLabel } from "./admin-money-format";

/** Mirrors `ReferenceLookup` in `admin-verification.service.ts`. */
interface ReferenceLookup {
  reference: string;
  checkedAt: string;
  paystack: {
    status: string;
    pesewas: number;
    currency: string;
    channel: string | null;
    paidAt: string | null;
    gatewayResponse: string | null;
    customerEmail: string | null;
  };
  payment: {
    id: string;
    status: string;
    pesewas: number;
    currency: string;
    createdAt: string;
    customerEmail: string | null;
    orderGroupId: string | null;
    carOrderId: string | null;
  } | null;
  orders: { id: string; orderNo: string | null; productName: string | null; status: string }[];
  canSettle: boolean;
  blockedReason: string | null;
}

interface SettleResult {
  settled: boolean;
  message: string;
  lookup: ReferenceLookup;
}

const ENDPOINT = "/api/admin/transactions/by-reference";

/**
 * "The customer says they paid." The admin pastes the Paystack reference,
 * the server asks Paystack, and both sides are shown next to each other. When
 * Paystack confirms the full amount on a payment we hold as unpaid, "Mark as
 * paid" settles it through the same path the webhook uses. The browser never
 * decides anything: the settle asks Paystack again on the server.
 */
export function AdminReferenceSettle() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [checking, setChecking] = useState(false);
  const [settling, setSettling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lookup, setLookup] = useState<ReferenceLookup | null>(null);

  async function runCheck(event?: React.FormEvent) {
    event?.preventDefault();
    if (!reference.trim()) return;
    setChecking(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<ReferenceLookup>>(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ reference: reference.trim() }),
      });
      setLookup(res.data);
    } catch (error) {
      setLookup(null);
      toast.error({
        title: "Could not check that reference",
        description: error instanceof Error ? error.message : "Nothing was changed.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function runSettle() {
    if (!lookup) return;
    setSettling(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<SettleResult>>(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ reference: lookup.reference, settle: true }),
      });
      setLookup(res.data.lookup);
      if (res.data.settled) {
        toast.success({ title: "Marked as paid", description: res.data.message });
        router.refresh();
      } else {
        toast.info({ title: "Nothing changed", description: res.data.message });
      }
      setConfirmOpen(false);
    } catch (error) {
      toast.error({
        title: "Could not mark as paid",
        description: error instanceof Error ? error.message : "Nothing was changed.",
      });
    } finally {
      setSettling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={runCheck} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AdminInput
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="TOM_1792016963655_9337bd0c874c"
          aria-label="Paystack reference"
          autoComplete="off"
          spellCheck={false}
          className="w-full font-mono sm:w-[340px]"
        />
        <AdminButton type="submit" busy={checking} disabled={!reference.trim()}>
          <MagnifyingGlass size={14} weight="bold" />
          Check with Paystack
        </AdminButton>
      </form>

      {lookup ? <LookupResult lookup={lookup} onSettle={() => setConfirmOpen(true)} /> : null}

      <AdminConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Mark this payment as paid?"
        consequence="Tomame asks Paystack again first. If Paystack still confirms the full amount, the payment is recorded, every order it paid for moves to paid, the customer is emailed, and your name goes in the audit log."
        detail={
          lookup ? (
            <span>
              {formatPesewas(lookup.paystack.pesewas)} on <span className="font-mono">{lookup.reference}</span>
              {lookup.orders.length > 0
                ? ` for ${lookup.orders.map((o) => o.orderNo ?? "an order").join(", ")}`
                : null}
            </span>
          ) : null
        }
        confirmLabel="Mark as paid"
        onConfirm={runSettle}
        busy={settling}
      />
    </div>
  );
}

function LookupResult({ lookup, onSettle }: { lookup: ReferenceLookup; onSettle: () => void }) {
  const { paystack, payment } = lookup;
  const paidOnPaystack = paystack.status === "success";

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-tm-paper p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {paidOnPaystack ? (
          <AdminBadge tone="green">
            <CheckCircle size={13} weight="fill" />
            Paystack has the money
          </AdminBadge>
        ) : (
          <AdminBadge tone="amber">
            <WarningCircle size={13} weight="fill" />
            Paystack says {paystack.status}
          </AdminBadge>
        )}
        {payment ? (
          <AdminBadge tone={payment.status === "success" ? "green" : "muted"}>
            Tomame: {transactionStatusLabel(payment.status)}
          </AdminBadge>
        ) : null}
        <span className="text-[12px] font-medium text-tm-text-3">Checked {formatDateTime(lookup.checkedAt)}</span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row label="Amount on Paystack" value={`${formatPesewas(paystack.pesewas)} ${paystack.currency}`} />
        <Row
          label="Amount we charged"
          value={payment ? `${formatPesewas(payment.pesewas)} ${payment.currency}` : "Not one of ours"}
          tone={payment && payment.pesewas !== paystack.pesewas ? "amber" : undefined}
        />
        <Row label="Paid at" value={formatDateTime(paystack.paidAt) ?? "Not paid"} />
        <Row label="Channel" value={channelLabel(paystack.channel) ?? "Unknown"} />
        <Row label="Paystack says" value={paystack.gatewayResponse ?? paystack.status} />
        <Row label="Customer" value={payment?.customerEmail ?? paystack.customerEmail ?? "Unknown"} />
      </dl>

      {lookup.orders.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {lookup.orders.map((order) => (
            <li key={order.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <Link href={`/admin/orders/${order.id}`} className="min-w-0 truncate font-semibold text-tm-ink hover:underline">
                {order.orderNo ?? "Order"} · {order.productName ?? "Untitled"}
              </Link>
              <span className="shrink-0 font-semibold text-tm-text-2 capitalize">{order.status.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {lookup.canSettle ? (
          <AdminButton variant="primary" onClick={onSettle}>
            Mark as paid
          </AdminButton>
        ) : null}
        {payment ? (
          <Link
            href={`/admin/transactions/${payment.id}`}
            className="text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
          >
            Open transaction
          </Link>
        ) : null}
      </div>
      {lookup.blockedReason ? (
        <p className="text-[12px] leading-[1.5] font-medium text-tm-text-2">{lookup.blockedReason}</p>
      ) : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-tm-hairline pb-2 last:border-0">
      <dt className="text-[12px] font-semibold text-tm-text-2">{label}</dt>
      <dd
        className={
          tone === "amber"
            ? "tm-nums text-right text-[13px] font-semibold text-tm-amber"
            : "tm-nums min-w-0 truncate text-right text-[13px] font-semibold text-tm-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
