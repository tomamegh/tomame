"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react/ssr";

import { AdminBadge } from "@/components/layout/admin";
import { AdminButton, AdminConfirm } from "@/components/layout/admin";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { ApiSuccessResponse } from "@/types/api";
import type { AdminPaymentStatus } from "@/db/queries/admin-money";
import { formatDateTime, formatPesewas, transactionStatusLabel } from "./admin-money-format";

/** Mirrors `PaystackCheck` in `admin-verification.service.ts`. */
interface PaystackCheck {
  reference: string;
  dbStatus: string;
  paystackStatus: string;
  chargedPesewas: number;
  paystackPesewas: number;
  chargedCurrency: string;
  paystackCurrency: string;
  channel: string | null;
  paidAt: string | null;
  checkedAt: string;
  agrees: boolean;
}

interface SyncResult {
  updated: boolean;
  paystackStatus: string;
  dbStatus: string;
  message: string;
}

export interface AdminTransactionVerifyProps {
  paymentId: string;
  status: AdminPaymentStatus;
}

/**
 * The two things an admin can do to a transaction, kept apart on purpose.
 *
 * **Check** asks Paystack what it holds and shows the answer. It changes
 * nothing, so it is safe on a settled payment and is the right button for
 * "the customer says they were debited".
 *
 * **Settle** runs the repair — `/sync`, which re-runs the payment callback and
 * therefore links orders, sends mail and writes audit rows. It only appears
 * while the payment is unsettled, because that is the only state it can
 * repair, and it asks first: re-running the callback is a customer-visible
 * event, not a refresh.
 */
export function AdminTransactionVerify({ paymentId, status }: AdminTransactionVerifyProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [check, setCheck] = useState<PaystackCheck | null>(null);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<PaystackCheck>>(
        `/api/admin/transactions/${paymentId}/check`,
        { method: "POST" },
      );
      setCheck(res.data);
    } catch (error) {
      setCheck(null);
      toast.error({
        title: "Could not reach Paystack",
        description: error instanceof Error ? error.message : "Nothing was changed.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<SyncResult>>(
        `/api/admin/transactions/${paymentId}/sync`,
        { method: "POST" },
      );
      const result = res.data;
      if (result.updated) {
        toast.success({ title: "Transaction settled", description: result.message });
        router.refresh();
      } else {
        toast.info({ title: "Nothing changed", description: result.message });
      }
      setConfirmOpen(false);
    } catch (error) {
      toast.error({
        title: "Settle failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminButton onClick={runCheck} busy={checking} variant="secondary">
          <ArrowsClockwise size={14} weight="bold" />
          Check with Paystack
        </AdminButton>
        {status === "pending" ? (
          <AdminButton variant="primary" onClick={() => setConfirmOpen(true)}>
            Settle from Paystack
          </AdminButton>
        ) : null}
      </div>

      <p className="text-[12px] leading-[1.5] font-medium text-tm-text-3">
        Checking reads Paystack and changes nothing.
        {status === "pending"
          ? " Settling re-runs the payment callback: it links the orders, emails the customer and writes an audit entry."
          : null}
      </p>

      {check ? <CheckResult check={check} /> : null}

      <AdminConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Settle this transaction from Paystack?"
        consequence="If Paystack reports the charge succeeded, the orders behind it move to paid, the customer is emailed, and the change is written to the audit log. Nothing happens if Paystack still shows it pending."
        confirmLabel="Settle from Paystack"
        onConfirm={runSync}
        busy={syncing}
      />
    </div>
  );
}

// ── The answer ───────────────────────────────────────────────────────────────

function CheckResult({ check }: { check: PaystackCheck }) {
  const checkedAt = formatDateTime(check.checkedAt);
  const paidAt = formatDateTime(check.paidAt);
  const amountAgrees = check.paystackPesewas === check.chargedPesewas;
  const currencyAgrees = check.paystackCurrency === check.chargedCurrency;

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-tm-paper p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {check.agrees ? (
          <AdminBadge tone="green">
            <CheckCircle size={13} weight="fill" />
            Paystack agrees
          </AdminBadge>
        ) : (
          <AdminBadge tone="amber">
            <WarningCircle size={13} weight="fill" />
            Paystack disagrees
          </AdminBadge>
        )}
        {checkedAt ? (
          <span className="text-[12px] font-medium text-tm-text-3">Checked {checkedAt}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <CheckRow label="Paystack says" value={check.paystackStatus} />
        <CheckRow label="We hold" value={transactionStatusLabel(check.dbStatus)} />
        <CheckRow
          label="Amount on Paystack"
          value={formatPesewas(check.paystackPesewas)}
          tone={amountAgrees ? undefined : "amber"}
        />
        <CheckRow label="Amount charged" value={formatPesewas(check.chargedPesewas)} />
        <CheckRow
          label="Currency"
          value={
            currencyAgrees
              ? check.chargedCurrency
              : `${check.paystackCurrency} on Paystack, ${check.chargedCurrency} here`
          }
          tone={currencyAgrees ? undefined : "amber"}
        />
        <CheckRow label="Paid at" value={paidAt ?? "Not recorded"} />
      </dl>

      {!amountAgrees ? (
        <p className="text-[12px] leading-[1.5] font-medium text-tm-amber">
          The amounts differ, so this charge will never settle on its own — the payment callback
          refuses to mark a transaction paid unless Paystack&rsquo;s amount matches ours exactly.
          This one needs a decision, not a retry.
        </p>
      ) : null}
    </div>
  );
}

function CheckRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-tm-hairline pb-2 last:border-0">
      <dt className="text-[12px] font-semibold text-tm-text-2">{label}</dt>
      <dd
        className={
          tone === "amber"
            ? "tm-nums text-right text-[13px] font-semibold text-tm-amber"
            : "tm-nums text-right text-[13px] font-semibold text-tm-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
