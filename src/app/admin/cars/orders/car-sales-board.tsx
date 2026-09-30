"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BanknoteIcon, UndoIcon } from "lucide-react";

import {
  AdminBadge,
  AdminButton,
  AdminConfirm,
  type AdminTone,
} from "@/components/layout/admin";
import { Textarea } from "@/components/ui/textarea";
import { formatPesewas } from "@/features/cars/format";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";
import { ApiFetchError, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";

import {
  checkBalanceAmount,
  readCarOrderStatus,
  type CarOrderMoney,
  type CarOrderPayment,
  type PriceOriginReading,
} from "./car-order-money";

/**
 * Operating a car sale: recording a balance, and unwinding one (migrations 068, 069).
 *
 * WHY THIS HALF IS A CLIENT ISLAND AND THE PAGE IS NOT. The sale itself is READ
 * — who bought what, for how much, and what is still out — and reading is the
 * server's job. What is here is the two things an admin DOES to a sale, both of
 * which are a figure or a sentence typed against a guarded transition that can
 * come back 409 when somebody else got there first. That is the same split the
 * enquiry queue next door uses.
 *
 * THE TWO CONTROLS ARE BOTH ABOUT MONEY THAT THIS SCREEN DOES NOT MOVE, and
 * every sentence in them is written around that fact:
 *
 *   RECORDING A BALANCE does not charge anybody. A car is GH₵120,000 to
 *   GH₵260,000 and a Ghanaian mobile money wallet cannot carry that in one
 *   transaction, so Paystack takes a deposit and the rest is settled by bank
 *   transfer or in person. This control writes down that the rest ARRIVED. An
 *   admin who believes it charges the customer will press it on a sale where
 *   nothing has been paid, and the order will then say paid in full while the
 *   money is still in somebody else's account.
 *
 *   UNWINDING does not refund anybody. It ends the sale and frees the vehicle,
 *   which is what `uq_car_orders_live` otherwise holds forever. Refunding is a
 *   Paystack action a person performs deliberately, and the route's own doc
 *   comment says the same thing at length.
 *
 * THE AMOUNT FIELD STARTS EMPTY, DELIBERATELY, and that is the whole design of
 * the balance control. `recordCarBalancePayment` accepts only the exact
 * outstanding figure, so a pre-filled field would make the commonest path
 * through this control one where nobody read the number being recorded. The
 * expected balance sits BESIDE the field instead, to be checked against a bank
 * statement; a figure that disagrees with it is refused here, in a sentence
 * naming both numbers, before any request is made.
 */

/**
 * The body `PATCH /api/admin/cars/orders/:id` accepts for recording a balance.
 *
 * `carOrderAdminActionSchema` is a discriminated union on `action`, so this is
 * the `record_balance` member of it: an amount in PESEWAS as a whole number, and
 * an optional note capped at 500 characters. The note is omitted rather than
 * sent empty, because the schema makes it optional and a blank string is not the
 * same statement as "nothing was written".
 *
 * WHY THE AMOUNT IS ALLOWED TO TRAVEL AT ALL, when nothing else in the car path
 * lets a browser name a figure: the service checks it against
 * `price_pesewas - deposit_pesewas` on the row and refuses anything else, so the
 * request CONFIRMS the balance rather than choosing it. The schema's own comment
 * makes the same argument at length. `checkBalanceAmount` refuses a mismatch
 * here first, so an admin meets the rule as a sentence rather than as a 400.
 */
function buildBalanceBody(pesewas: number, note: string): unknown {
  return {
    action: "record_balance",
    amountPesewas: pesewas,
    ...(note ? { note } : {}),
  };
}

export interface AdminCarSale {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  depositPaidAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  balanceNote: string | null;
  /** "2019 Toyota Highlander XLE", as it read on the day of sale. */
  carLabel: string;
  carListingId: string;
  /** Null when the listing has since been deleted. */
  listingIsPublished: boolean | null;
  /** The enquiry the agreed figure came from, when it came from one. */
  carEnquiryId: string | null;
  customer: { id: string; name: string | null; email: string | null };
  money: CarOrderMoney;
  payments: CarOrderPayment[];
  origin: PriceOriginReading;
}

export function CarSalesBoard({ sales }: { sales: readonly AdminCarSale[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-4">
      {sales.map((sale) => (
        <SaleCard key={sale.id} sale={sale} />
      ))}
    </ul>
  );
}

function SaleCard({ sale }: { sale: AdminCarSale }) {
  const router = useRouter();
  const status = readCarOrderStatus(sale.status);
  const { money } = sale;
  const unwound = Boolean(sale.cancelledAt);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-[18px] border p-4 sm:p-5",
        status.needsAction ? "border-tm-coral/25 bg-card" : "border-tm-border bg-card",
      )}
    >
      {/* ── Who bought what ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
            <AdminBadge tone={ORIGIN_TONE[sale.origin.source]}>{sale.origin.label}</AdminBadge>
            <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
              {formatAdminDateTime(sale.createdAt) ?? "Just now"}
            </span>
          </div>

          <p className="min-w-0 text-[14.5px] leading-[1.35] font-semibold text-tm-ink">
            <Link
              href={`/admin/cars/${sale.carListingId}`}
              className="underline-offset-2 hover:underline"
            >
              {sale.carLabel}
            </Link>
          </p>

          <p className="min-w-0 text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
            Bought by{" "}
            <Link
              href={`/admin/users/${sale.customer.id}`}
              className="font-semibold text-tm-ink underline-offset-2 hover:underline"
            >
              {sale.customer.name ?? sale.customer.email ?? "a customer"}
            </Link>
            {sale.customer.name && sale.customer.email ? (
              <>
                {" · "}
                <span className="tm-nums">{sale.customer.email}</span>
              </>
            ) : null}
          </p>

          {sale.origin.note || sale.carEnquiryId ? (
            <p className="min-w-0 text-[12px] leading-[1.45] font-medium text-tm-text-3">
              {sale.origin.note}
              {sale.carEnquiryId ? (
                <>
                  {sale.origin.note ? " " : null}
                  <Link
                    href={`/admin/cars/enquiries?status=all&car=${sale.carListingId}`}
                    className="font-semibold text-tm-coral-strong underline underline-offset-2"
                  >
                    See the conversation it was agreed in
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {/*
          The three figures, in the order somebody chasing money reads them.

          NOT `shrink-0`, which is the first thing anybody would write here and
          is wrong at 390px: a shrink-0 flex item is sized by its max-content
          width and does not wrap, so the third figure was being cut off the
          right edge of a phone. `min-w-0` lets the group take the width it has
          and `flex-wrap` lets the figures stack inside it.
        */}
        <dl className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
          <Figure label="Agreed" value={formatPesewas(money.pricePesewas)} />
          <Figure
            label={`Deposit (${money.depositPercent}%)`}
            value={formatPesewas(money.depositPesewas)}
            tone={money.depositSettled ? "green" : "muted"}
            hint={money.depositSettled ? "received" : "not taken yet"}
          />
          <Figure
            label="Outstanding"
            value={formatPesewas(money.outstandingPesewas)}
            tone={money.outstandingPesewas > 0 && !unwound ? "coral" : "muted"}
            hint={money.fullyPaid ? "nothing owing" : null}
          />
        </dl>
      </div>

      <p className="max-w-[78ch] text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
        {status.blurb}
        {sale.listingIsPublished === false ? " The listing is no longer on the site." : null}
        {sale.listingIsPublished === null
          ? " The listing itself has since been deleted, so the car is named as it read on the day."
          : null}
      </p>

      {/* ── What has already been written down ────────────────────────── */}
      {money.balanceAmountPesewas !== null ? (
        <div className="min-w-0 rounded-[14px] bg-tm-paper px-4 py-3">
          <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
            The balance, as recorded
          </p>
          <p className="tm-nums mt-2 text-[14px] leading-none font-bold text-tm-ink">
            {formatPesewas(money.balanceAmountPesewas)}
          </p>
          {sale.balanceNote ? (
            <p className="mt-1.5 min-w-0 text-[13px] leading-[1.5] break-words whitespace-pre-wrap text-tm-text-2">
              {sale.balanceNote}
            </p>
          ) : null}
          <p className="tm-nums mt-1.5 text-[12px] leading-none font-medium text-tm-text-3">
            {formatAdminDateTime(sale.paidAt) ?? "Recorded"}
          </p>
        </div>
      ) : null}

      {sale.payments.length > 0 ? <PaymentLog payments={sale.payments} /> : null}

      {sale.cancelledAt ? (
        <div className="min-w-0 rounded-[14px] bg-tm-paper px-4 py-3">
          <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
            Why this sale was unwound
          </p>
          <p className="mt-2 min-w-0 text-[13px] leading-[1.5] break-words whitespace-pre-wrap text-tm-text-2">
            {sale.cancelReason ?? "No reason was recorded."}
          </p>
          <p className="tm-nums mt-1.5 text-[12px] leading-none font-medium text-tm-text-3">
            {formatAdminDateTime(sale.cancelledAt)}
          </p>
          {money.receivedPesewas > 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-[1.45] font-semibold text-tm-amber">
              {formatPesewas(money.receivedPesewas)} was received on this sale and was not
              refunded by unwinding it.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── The two controls ─────────────────────────────────────────── */}
      {unwound ? (
        <p className="text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
          This sale is over and the car is back on the market. If the customer still wants it,
          they buy it again from the listing.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {money.awaitingBalance ? (
            <BalanceForm sale={sale} onDone={() => router.refresh()} />
          ) : (
            <p className="text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
              {money.fullyPaid
                ? "Nothing is outstanding on this sale, so there is no balance to record."
                : "The deposit has not settled yet, so there is no balance to record. A balance can only be written down once the customer has paid their deposit through Paystack."}
            </p>
          )}
          <ReleaseControl sale={sale} onDone={() => router.refresh()} />
        </div>
      )}
    </li>
  );
}

// ── Recording a balance ─────────────────────────────────────────────────────

function BalanceForm({ sale, onDone }: { sale: AdminCarSale; onDone: () => void }) {
  // The row's own generated column, which is exactly what
  // `recordCarBalancePayment` compares the typed amount against. Deriving the
  // expected figure any other way here would let this screen and the service
  // disagree about a five-figure number.
  const expected = sale.money.balancePesewas;

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const check = checkBalanceAmount(amount, expected);
  const typed = amount.trim().length > 0;

  async function record() {
    if (!check.ok || busy) return;

    setBusy(true);
    try {
      const response = await apiFetch<ApiSuccessResponse<{ recorded: boolean }>>(
        `/api/admin/cars/orders/${sale.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBalanceBody(check.pesewas, note.trim())),
        },
      );

      // `recorded: false` means this balance was already written down, by
      // another admin or by this one twice. The route is idempotent on purpose
      // and says so; repeating it back as a fresh receipt would be the one lie
      // this screen must not tell.
      if (response.data?.recorded === false) {
        toast.info({
          title: "Already recorded",
          description: "Somebody had already written this balance down. Nothing was changed.",
        });
      } else {
        toast.success({
          title: "Balance recorded",
          description: `${formatPesewas(check.pesewas)} written down against ${sale.carLabel}. No money was moved by this.`,
        });
      }
      setConfirming(false);
      setAmount("");
      setNote("");
      startTransition(onDone);
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 409) {
        toast.info({
          title: "Someone else got there first",
          description: "This sale has moved on. The screen is being refreshed.",
        });
        setConfirming(false);
        startTransition(onDone);
        return;
      }
      toast.error({
        title: "Could not record that",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] leading-none font-bold text-tm-ink">Record the balance</p>
        {/*
          THE SENTENCE THIS WHOLE CONTROL IS BUILT AROUND. An admin who reads it
          as "charge the customer" will use it on a sale where nothing has
          arrived, and the order will then say paid in full.
        */}
        <p className="max-w-[78ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          This moves no money. It writes down that the customer has already paid you by
          another route, such as a bank transfer or cash in the office. Nothing is charged to
          their card or their wallet and no Paystack transaction is created. Record it only
          once the money has actually arrived and cleared.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={`balance-${sale.id}`}
            className="text-[12px] leading-none font-semibold text-tm-text-2"
          >
            Amount received
          </label>
          <span className="flex items-stretch overflow-hidden rounded-[12px] border border-tm-border bg-card focus-within:border-tm-coral/50 focus-within:ring-2 focus-within:ring-tm-coral/15">
            <span className="flex shrink-0 items-center border-r border-tm-hairline bg-tm-paper px-2.5 text-[13px] font-semibold text-tm-text-3 select-none">
              GH₵
            </span>
            <input
              id={`balance-${sale.id}`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              disabled={busy}
              aria-describedby={`balance-expected-${sale.id}`}
              aria-invalid={typed && !check.ok ? true : undefined}
              className="tm-nums h-10 min-w-0 flex-1 bg-card px-3 text-[14px] font-semibold text-tm-ink outline-none placeholder:font-normal placeholder:text-tm-text-3 disabled:opacity-60"
            />
          </span>
          {/*
            The expected figure sits BESIDE the field and never inside it. An
            admin can check it against their bank statement without the screen
            having agreed to it on their behalf.
          */}
          <p
            id={`balance-expected-${sale.id}`}
            className="text-[12px] leading-[1.45] font-medium text-tm-text-3"
          >
            The balance on this sale is{" "}
            <span className="tm-nums font-bold text-tm-ink">{formatPesewas(expected)}</span>.
            Type what actually arrived. Only that exact figure can be recorded.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={`balance-note-${sale.id}`}
            className="text-[12px] leading-none font-semibold text-tm-text-2"
          >
            How it arrived
          </label>
          <Textarea
            id={`balance-note-${sale.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            disabled={busy}
            placeholder="Bank transfer, GCB, reference 8841, cleared 14 Sep. Or: cash, counted at the office by Ama."
            className="min-h-[64px] w-full resize-y rounded-[12px] border-tm-border bg-card text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
          />
          <p className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
            Kept on the sale. When the transfer actually cleared belongs here, because only
            you can see that.
          </p>
        </div>
      </div>

      {typed && !check.ok ? (
        <p
          role="status"
          className="rounded-[12px] bg-tm-amber-bg px-3.5 py-2.5 text-[12.5px] leading-[1.45] font-semibold text-[#7a4a06]"
        >
          {check.problem}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminButton
          variant="primary"
          disabled={!check.ok || busy}
          onClick={() => setConfirming(true)}
        >
          <BanknoteIcon className="size-3.5" aria-hidden />
          Record this balance
        </AdminButton>
      </div>

      <AdminConfirm
        open={confirming}
        onOpenChange={setConfirming}
        title="Record this balance?"
        consequence="This writes down money that has already reached you somewhere else. It charges nothing, refunds nothing and creates no Paystack transaction. If the money has not actually arrived, stop here."
        detail={
          check.ok ? (
            <div className="flex flex-col gap-1.5">
              <p className="tm-nums">
                Recording <span className="font-bold">{formatPesewas(check.pesewas)}</span>{" "}
                against {sale.carLabel}.
              </p>
              <p className="tm-nums text-tm-text-2">
                The balance outstanding is {formatPesewas(expected)}, so this sale becomes
                paid in full.
              </p>
            </div>
          ) : null
        }
        confirmLabel="Yes, it has arrived"
        onConfirm={() => void record()}
        busy={busy}
      />
    </div>
  );
}

// ── Unwinding a sale ────────────────────────────────────────────────────────

function ReleaseControl({ sale, onDone }: { sale: AdminCarSale; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const written = reason.trim();

  async function release() {
    if (written.length === 0 || busy) return;

    setBusy(true);
    try {
      const response = await apiFetch<ApiSuccessResponse<{ released: boolean }>>(
        `/api/admin/cars/orders/${sale.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "release", reason: written }),
        },
      );

      // `released: false` means the row moved between the read and the guarded
      // write. Reported as what it is rather than dressed up as success, which
      // is the contract the route publishes.
      if (response.data?.released === false) {
        toast.info({
          title: "Nothing was unwound",
          description: "This sale had already moved on. The screen is being refreshed.",
        });
      } else {
        toast.success({
          title: "Sale unwound",
          description: `${sale.carLabel} is back on the market. No money has been refunded by this.`,
        });
      }
      setConfirming(false);
      setOpen(false);
      setReason("");
      startTransition(onDone);
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 409) {
        toast.info({
          title: "Someone else got there first",
          description: "This sale has moved on. The screen is being refreshed.",
        });
        setConfirming(false);
        startTransition(onDone);
        return;
      }
      toast.error({
        title: "Could not unwind that",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminButton variant="danger" onClick={() => setOpen(true)}>
          <UndoIcon className="size-3.5" aria-hidden />
          Unwind this sale
        </AdminButton>
        <span className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
          Frees the car to be sold again. It refunds nothing.
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-tm-coral/25 bg-tm-pill-bg/40 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] leading-none font-bold text-tm-ink">Unwind this sale</p>
        {/*
          THE SENTENCE THAT KEEPS THIS HONEST. The route does not touch the
          money, and an admin who assumes it does will leave a five-figure
          deposit sitting with a customer who believes they have been refunded.
        */}
        <p className="max-w-[78ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
          This refunds nothing. It ends the sale and puts the car back on the market, which is
          what a refund, a vehicle damaged on the water, or a buyer who walks away all need.
          Any money already taken stays exactly where it is until somebody refunds it in
          Paystack by hand.
          {sale.money.receivedPesewas > 0 ? (
            <>
              {" "}
              <span className="font-bold text-tm-ink">
                {formatPesewas(sale.money.receivedPesewas)} has been received on this sale and
                would have to be refunded separately.
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={`release-${sale.id}`}
          className="text-[12px] leading-none font-semibold text-tm-text-2"
        >
          Why this sale is being unwound
        </label>
        <Textarea
          id={`release-${sale.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          disabled={busy}
          placeholder="Deposit refunded in full on 14 Sep after the buyer pulled out. Or: vehicle damaged on the vessel, insurance claim opened."
          className="min-h-[64px] w-full resize-y rounded-[12px] border-tm-border bg-card text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
        />
        <p className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
          Required, and kept on the sale. It is the only record of why a car came back onto
          the market after somebody had paid a deposit for it.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AdminButton
          variant="danger"
          disabled={written.length === 0 || busy}
          onClick={() => setConfirming(true)}
        >
          <UndoIcon className="size-3.5" aria-hidden />
          Unwind and put the car back on sale
        </AdminButton>
        <AdminButton
          variant="quiet"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
        >
          Cancel
        </AdminButton>
      </div>

      <AdminConfirm
        open={confirming}
        onOpenChange={setConfirming}
        title="Unwind this sale?"
        consequence="The car goes back on the market and this order is closed. No money is refunded by this: if the customer is owed anything, refund it in Paystack yourself."
        detail={
          <div className="flex flex-col gap-1.5">
            <p>{sale.carLabel}</p>
            <p className="tm-nums text-tm-text-2">
              {sale.money.receivedPesewas > 0
                ? `${formatPesewas(sale.money.receivedPesewas)} has been received and stays where it is.`
                : "Nothing has been received on this sale."}
            </p>
          </div>
        }
        confirmLabel="Unwind the sale"
        onConfirm={() => void release()}
        busy={busy}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Figure({
  label,
  value,
  tone = "neutral",
  hint = null,
}: {
  label: string;
  value: string;
  tone?: AdminTone;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "tm-nums font-display text-[19px] leading-none font-bold sm:text-[21px]",
          FIGURE_TONE[tone],
        )}
      >
        {value}
      </dd>
      {hint ? (
        <dd className="text-[11.5px] leading-none font-medium text-tm-text-3">{hint}</dd>
      ) : null}
    </div>
  );
}

const FIGURE_TONE: Record<AdminTone, string> = {
  neutral: "text-tm-ink",
  green: "text-tm-green",
  amber: "text-tm-amber",
  coral: "text-tm-coral-strong",
  muted: "text-tm-text-3",
};

/**
 * Every Paystack payment attached to the sale, successful or not.
 *
 * THE FAILED AND ABANDONED ONES ARE SHOWN TOO, struck through. An admin about to
 * chase a balance needs to be able to see that the customer has three failed
 * attempts against this car, because that is usually the explanation for a
 * transfer turning up in the bank instead. None of these figures is summed into
 * the sale's arithmetic: the row is the authority and this is the evidence.
 */
function PaymentLog({ payments }: { payments: readonly CarOrderPayment[] }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-tm-paper px-4 py-3">
      <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
        What came through Paystack
      </p>
      <ul className="mt-2 flex min-w-0 flex-col gap-1.5">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] leading-[1.45] font-medium"
          >
            <span
              className={cn(
                "tm-nums font-bold",
                payment.status === "success" ? "text-tm-ink" : "text-tm-text-3 line-through",
              )}
            >
              {formatPesewas(payment.amountPesewas)}
            </span>
            <span className="text-tm-text-2">
              {PAYMENT_STATUS_WORD[payment.status] ?? payment.status}
            </span>
            {payment.channel ? (
              <span className="text-tm-text-3">via {payment.channel.replace(/_/g, " ")}</span>
            ) : null}
            <span className="tm-nums min-w-0 break-all text-tm-text-3">{payment.reference}</span>
            <span className="tm-nums text-tm-text-3">
              {formatAdminDateTime(payment.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAYMENT_STATUS_WORD: Record<string, string> = {
  success: "received",
  pending: "started, never finished",
  failed: "failed",
};

const ORIGIN_TONE: Record<PriceOriginReading["source"], AdminTone> = {
  listing: "neutral",
  quote: "amber",
  accepted_offer: "amber",
  unknown: "muted",
};
