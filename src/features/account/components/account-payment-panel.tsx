import Link from "next/link";
import { LockKey } from "@phosphor-icons/react/ssr";

import type { PaymentChannel, PaymentResponse } from "@/features/payments/types";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import { AccountEmpty, AccountPanel } from "./account-panel";
import { formatPaymentChannel, formatPaymentDate, pesewasToGhs } from "../format";

/**
 * Payment — what this account has paid, and how paying here works.
 *
 * **There are no saved cards, and this panel must never imply there are.**
 * Paystack tokenisation is not implemented: `payments.channel` records the
 * channel a transaction WENT OUT on, which is history, not an instrument on
 * file. So the tab shows the transactions and the channels Paystack will offer
 * at checkout — both real rows — and says plainly that Tomame holds no card
 * details, which is what the payment policy says too.
 *
 * A server component: every figure is read on the server and rendered once.
 * Amounts arrive in pesewas (CLAUDE.md) and are divided here, at the edge,
 * rather than anywhere a rounding could leak back into a total.
 */
export function AccountPaymentPanel({
  transactions,
  channels,
  holdNote,
  blurb,
}: {
  transactions: PaymentResponse[];
  channels: PaymentChannel[];
  holdNote: string | null;
  blurb: string;
}) {
  return (
    <AccountPanel title="Payment" blurb={blurb}>
      {/* ── What we do and do not keep ─────────────────────────────────── */}
      <div className="flex gap-3 rounded-2xl border border-tm-border bg-tm-paper p-4">
        <LockKey weight="duotone" className="size-5 shrink-0 text-tm-coral" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm leading-none font-semibold">
            Tomame stores no card or Mobile Money details
          </p>
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
            There is nothing saved to manage here. Every payment goes through
            Paystack, who take the card or MoMo details on their own page and
            never pass them to us, so each checkout asks again, and there is no
            stored instrument for anyone to lift from this account.
          </p>
          <Link
            href="/policies#payment"
            className="w-fit text-[13px] leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline"
          >
            Read the payment policy
          </Link>
        </div>
      </div>

      {/* ── The channels the admin actually has switched on ─────────────── */}
      {channels.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[13px] leading-none font-semibold">Ways you can pay</h3>
          <ul className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <li
                key={channel.id}
                className="flex items-center gap-2 rounded-full border border-tm-border bg-card px-3 py-1.5 text-xs leading-none font-semibold"
              >
                {channel.dot ? (
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: channel.dot }}
                  />
                ) : null}
                {channel.label}
              </li>
            ))}
          </ul>
          {holdNote ? (
            <p className="text-xs leading-[1.45] font-medium text-tm-text-3">{holdNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* ── History ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-[13px] leading-none font-semibold">Payment history</h3>

        {transactions.length === 0 ? (
          <AccountEmpty
            title="No payments yet"
            body="Once you pay for a bag, every transaction shows up here with its Paystack reference, the one to quote if you ever need us to look one up."
          />
        ) : (
          <ul className="flex flex-col">
            {transactions.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-tm-hairline py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm leading-none font-semibold">
                    {formatPaymentDate(payment.createdAt)}
                  </span>
                  <span className="truncate font-mono text-xs leading-none text-tm-text-3">
                    {payment.reference}
                    {payment.channel ? ` · ${formatPaymentChannel(payment.channel)}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="tm-nums text-sm leading-none font-bold">
                    {formatGhs(pesewasToGhs(payment.amount))}
                  </span>
                  <PaymentStatusPill status={payment.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AccountPanel>
  );
}

/** `payments.status` is `pending | success | failed` (005) — three, no more. */
function PaymentStatusPill({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "bg-tm-green-bg text-tm-green-ink"
      : status === "failed"
        ? "bg-tm-tint text-tm-coral-strong"
        : "bg-tm-amber-bg text-tm-amber";

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] leading-none font-bold capitalize",
        tone,
      )}
    >
      {status}
    </span>
  );
}
