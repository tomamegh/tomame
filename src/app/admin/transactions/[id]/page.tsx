import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Package } from "@phosphor-icons/react/ssr";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminTableScroller,
} from "@/components/layout/admin";
import { getAdminTransaction } from "@/db/queries/admin-money";
import { formatGhs, formatUsd } from "@/features/marketing/format";
import { AdminCopyValue } from "@/features/payments/components/admin-copy-value";
import {
  channelLabel,
  customerName,
  describeVerification,
  formatDateTime,
  formatPesewas,
  transactionStatusLabel,
  transactionTone,
} from "@/features/payments/components/admin-money-format";
import { AdminTransactionVerify } from "@/features/payments/components/admin-transaction-verify";
import { cn } from "@/lib/utils";

/**
 * `/admin/transactions/[id]` — one Paystack charge, told honestly.
 *
 * TWO THINGS THIS SCREEN GOT WRONG BEFORE. It showed "Linked Order", singular,
 * which has been incorrect since 048 made a checkout an `order_groups` row that
 * one transaction can pay for several orders at once — the other lines simply
 * vanished. And it dumped the raw Paystack payload as JSON under a heading that
 * implied verification had happened, even for a pending payment that nothing
 * has ever verified. Both are fixed here: the group and all its orders are
 * listed, and the verification panel says plainly when there is nothing to show
 * because no check has ever run.
 */
export const metadata: Metadata = {
  title: "Transaction · Tomame admin",
};

/** Never cached: this screen exists to answer "what is true right now". */
export const dynamic = "force-dynamic";

export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const txn = await getAdminTransaction(id);
  if (!txn) notFound();

  const name = customerName(txn.customer);
  const channel = channelLabel(txn.channel);
  const initiated = formatDateTime(txn.created_at);
  const verificationLines = describeVerification(txn.paystack_verification, txn.amount);

  // The group was billed `total_pesewas`; the payment charged `amount`. They
  // are the same figure in the same unit, and a divergence means the bag moved
  // after the charge was raised — worth saying out loud, never worth hiding.
  const billingMismatch =
    txn.group != null && txn.group.total_pesewas !== txn.amount ? txn.group.total_pesewas : null;

  return (
    <AdminPage
      title={formatPesewas(txn.amount)}
      blurb={
        initiated
          ? `Paystack charge initiated ${initiated}${channel ? ` · ${channel}` : ""}`
          : "Paystack charge"
      }
      action={
        <AdminBadge tone={transactionTone(txn.status)}>
          {transactionStatusLabel(txn.status)}
        </AdminBadge>
      }
    >
      <Link
        href="/admin/transactions"
        className="tm-up inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors [animation-duration:0.5s] hover:text-tm-ink"
      >
        <ArrowLeft size={14} weight="bold" />
        All transactions
      </Link>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* ── Verification ───────────────────────────────────────────────── */}
        <AdminCard
          title="Verification"
          blurb="What Paystack said about this reference, and when. Verification is server-side only — nothing on this screen is taken from the browser."
          index={0}
        >
          <div className="flex flex-col gap-5">
            <dl className="flex flex-col gap-2">
              <DetailRow label="Reference">
                <AdminCopyValue value={txn.reference} />
              </DetailRow>
              <DetailRow label="Charged">
                <span className="tm-nums font-semibold">{formatPesewas(txn.amount)}</span>
                <span className="ml-1.5 text-[12px] font-medium text-tm-text-3">
                  ({txn.amount.toLocaleString("en-GH")} pesewas, {txn.currency})
                </span>
              </DetailRow>
              {verificationLines.map((line) => (
                <DetailRow key={line.label} label={line.label}>
                  <span
                    className={cn(
                      "tm-nums font-semibold",
                      line.tone === "amber" ? "text-tm-amber" : "text-tm-ink",
                    )}
                  >
                    {line.value}
                  </span>
                </DetailRow>
              ))}
            </dl>

            {verificationLines.length === 0 ? (
              <AdminEmpty
                title="Nothing has verified this charge"
                body="No Paystack verification has ever been stored against this reference, so we do not know what happened to it. Check with Paystack to find out."
              />
            ) : null}

            <AdminTransactionVerify paymentId={txn.id} status={txn.status} />

            {txn.paystack_verification ? (
              <details className="rounded-[14px] border border-tm-hairline">
                <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold text-tm-text-2">
                  Raw Paystack payload
                </summary>
                <pre className="max-h-80 overflow-auto border-t border-tm-hairline px-4 py-3 text-[11px] leading-relaxed text-tm-text-2">
                  {JSON.stringify(txn.paystack_verification, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </AdminCard>

        {/* ── Customer ───────────────────────────────────────────────────── */}
        <AdminCard title="Customer" index={1}>
          {txn.customer ? (
            <dl className="flex flex-col gap-2">
              <DetailRow label="Name">
                {name ?? <span className="text-tm-text-3">Not set</span>}
              </DetailRow>
              <DetailRow label="Email">
                {txn.customer.email ?? <span className="text-tm-text-3">Not available</span>}
              </DetailRow>
              <DetailRow label="Profile">
                <Link
                  href={`/admin/users/${txn.customer.id}`}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-tm-coral-strong hover:underline"
                >
                  Open profile
                  <ArrowRight size={13} weight="bold" />
                </Link>
              </DetailRow>
            </dl>
          ) : (
            <AdminEmpty
              title="No profile on this payment"
              body="The payment row points at a user who no longer has a profile. The charge itself is unaffected."
            />
          )}
        </AdminCard>
      </div>

      {/* ── What it bought ──────────────────────────────────────────────── */}
      <AdminCard
        title={txn.group ? "What this paid for" : "Linked order"}
        blurb={
          txn.group
            ? `One checkout, ${txn.group.item_count} ${txn.group.item_count === 1 ? "line" : "lines"}, paid by this single transaction.`
            : "A pre-048 payment, raised before a checkout could span several orders."
        }
        flush
        index={2}
      >
        {txn.orders.length === 0 ? (
          <div className="p-5">
            <AdminEmpty
              title="Nothing is linked to this charge"
              body="No order points at this payment. For an unsettled charge that is expected — the orders are linked when it settles."
            />
          </div>
        ) : (
          <AdminTableScroller>
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={ADMIN_TH}>Product</th>
                  <th className={ADMIN_TH}>From</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Qty</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Line total</th>
                  <th className={ADMIN_TH}>Status</th>
                  <th className={ADMIN_TH}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {txn.orders.map((order) => (
                  <tr key={order.id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>
                      <div className="flex items-center gap-3">
                        {order.product_image_url ? (
                          <span className="relative size-9 shrink-0 overflow-hidden rounded-[10px] border border-tm-hairline bg-card">
                            <Image
                              src={order.product_image_url}
                              alt=""
                              fill
                              sizes="36px"
                              className="object-contain"
                            />
                          </span>
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-tm-paper text-tm-text-3">
                            <Package size={16} weight="bold" />
                          </span>
                        )}
                        <span className="line-clamp-2 max-w-[280px] font-medium">
                          {order.product_name}
                        </span>
                      </div>
                    </td>
                    <td className={cn(ADMIN_TD, "text-tm-text-2")}>{order.origin_country}</td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right")}>{order.quantity}</td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right font-semibold")}>
                      {order.total_ghs != null ? (
                        formatGhs(order.total_ghs)
                      ) : (
                        <span className="font-medium text-tm-text-3">No snapshot</span>
                      )}
                    </td>
                    <td className={cn(ADMIN_TD, "text-tm-text-2 capitalize")}>
                      {order.status.replace(/_/g, " ")}
                    </td>
                    <td className={cn(ADMIN_TD, "text-right")}>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-tm-coral-strong hover:underline"
                      >
                        Open
                        <ArrowRight size={13} weight="bold" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroller>
        )}
      </AdminCard>

      {/* ── The group's money ───────────────────────────────────────────── */}
      {txn.group ? (
        <AdminCard
          title="How the total was built"
          blurb="The group's frozen figures, exactly as checkout wrote them. Nothing here is recalculated for display."
          index={3}
        >
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-8">
            <DetailRow label="Items (USD)">
              <span className="tm-nums font-semibold">{formatUsd(txn.group.subtotal_usd)}</span>
            </DetailRow>
            <DetailRow label="Tax (USD)">
              <span className="tm-nums font-semibold">{formatUsd(txn.group.tax_usd)}</span>
            </DetailRow>
            <DetailRow label="Tomame fee (USD)">
              <span className="tm-nums font-semibold">{formatUsd(txn.group.fee_usd)}</span>
            </DetailRow>
            <DetailRow label="Freight">
              <span className="tm-nums font-semibold">{formatGhs(txn.group.freight_ghs)}</span>
            </DetailRow>
            <DetailRow label="Consolidation saving">
              <span className="tm-nums font-semibold text-tm-green">
                −{formatGhs(txn.group.consolidation_saving_ghs)}
              </span>
            </DetailRow>
            <DetailRow label="Delivery fee">
              <span className="tm-nums font-semibold">{formatGhs(txn.group.delivery_fee_ghs)}</span>
            </DetailRow>
            <DetailRow label="Group total">
              <span className="tm-nums font-semibold">{formatGhs(txn.group.total_ghs)}</span>
            </DetailRow>
            <DetailRow label="Group status">
              <span className="capitalize">{txn.group.status}</span>
            </DetailRow>
          </dl>

          {billingMismatch != null ? (
            <p className="mt-4 rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.55] font-medium text-[#7a4a06]">
              This group was billed {formatPesewas(billingMismatch)} but the charge was raised for{" "}
              {formatPesewas(txn.amount)}. The two should be identical — the difference means the
              group moved after the transaction was initialised, and the charge is the figure the
              customer actually paid.
            </p>
          ) : null}
        </AdminCard>
      ) : null}
    </AdminPage>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-tm-hairline pb-2 last:border-0">
      <dt className="text-[12px] leading-none font-semibold text-tm-text-2">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-tm-ink">{children}</dd>
    </div>
  );
}
