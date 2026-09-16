"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, SendIcon, XIcon } from "lucide-react";

import { AdminBadge, AdminButton, type AdminTone } from "@/components/layout/admin";
import { Textarea } from "@/components/ui/textarea";
import {
  CAR_ENQUIRY_KINDS,
  CAR_ENQUIRY_STATUSES,
  type CarEnquiryStatus,
} from "@/config/constants";
import { formatPesewas } from "@/features/cars/format";
import type { CarEnquiryRow } from "@/features/cars/types";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";

import { cedisFromPesewas, parseCedis } from "../car-form-state";

/**
 * Answering a car enquiry (migration 067).
 *
 * ACCEPTING AN OFFER RECORDS THAT A HUMAN SAID YES, AND NOTHING ELSE. No order
 * is created, no payment is taken, and no state machine starts — buying a car is
 * a later phase pending a product decision about deposits and about what happens
 * to a customer's money while a vehicle is mid-ocean. Every word on this screen
 * is written to avoid implying a sale, because this is the surface where
 * somebody would most naturally assume one had happened.
 *
 * WHAT EACH KIND OFFERS, AND WHY THEY DIFFER. A PRICE REQUEST has one useful
 * answer: a figure. An OFFER has three: take it, counter it, or refuse it. The
 * controls are therefore different per row rather than a single generic form,
 * because a generic form would offer "accept" on a price request, which is
 * accepting nothing.
 *
 * WHAT `answerCarEnquirySchema` REFUSES, AND WHAT IS REFUSED HERE FIRST:
 *   - "answered" with neither a price nor a reply — a row that leaves the queue
 *     while the customer is still waiting, and nobody looks at it again;
 *   - "declined" with no words — the customer SEES this, and a refusal with no
 *     reason is worse than no answer.
 * The disabled button and the sentence under it are so an admin never meets
 * either as a 400.
 *
 * A 409 IS NOT A FAULT. It means another admin answered first, which is the
 * ordinary case with two people working a queue — reported as information and
 * followed by a refresh, the same call the sourcing queue makes.
 */

export interface AdminCarEnquiry {
  enquiry: CarEnquiryRow;
  /** Null only if the listing vanished between the two reads. */
  car: {
    id: string;
    slug: string;
    title: string;
    priceState: string;
    pricePesewas: number | null;
    isPublished: boolean;
  } | null;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

/** The states `answerEnquiry` will transition FROM. Settled rows are read-only. */
const ANSWERABLE: readonly string[] = [
  CAR_ENQUIRY_STATUSES.OPEN,
  CAR_ENQUIRY_STATUSES.ANSWERED,
];

export function EnquiryQueue({ rows }: { rows: readonly AdminCarEnquiry[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-4">
      {rows.map((row) => (
        <EnquiryCard key={row.enquiry.id} row={row} />
      ))}
    </ul>
  );
}

function EnquiryCard({ row }: { row: AdminCarEnquiry }) {
  const router = useRouter();
  const { enquiry, car, customer } = row;

  const [reply, setReply] = useState(enquiry.admin_response ?? "");
  // `cedisFromPesewas`, not `pesewas / 100`: a quote of GH₵178,000.50 came back
  // into the field as "178000.5", which reads as a different number and would be
  // re-sent as one the moment anybody touched the row. The helper is the exact
  // inverse of `parseCedis`, so a counter that changes nothing sends the figure
  // that is already stored.
  const [quote, setQuote] = useState(cedisFromPesewas(enquiry.quoted_pesewas));
  const [busy, setBusy] = useState<CarEnquiryStatus | null>(null);
  const [, startTransition] = useTransition();

  const isOffer = enquiry.kind === CAR_ENQUIRY_KINDS.OFFER;
  const answerable = ANSWERABLE.includes(enquiry.status);
  const quoted = parseCedis(quote);
  // Narrowed once so the disabled logic below is not re-deciding the union.
  const quotedPesewas = quoted.ok ? quoted.pesewas : null;
  const hasWords = reply.trim().length > 0;

  async function answer(status: AnswerStatus) {
    if (busy) return;

    if (!quoted.ok) {
      toast.error({ title: "Not sent", description: quoted.problem });
      return;
    }
    if (status === "answered" && !hasWords && quoted.pesewas === null) {
      toast.error({ title: "Not sent", description: "An answer needs a price or a reply." });
      return;
    }
    if (status === "declined" && !hasWords) {
      toast.error({
        title: "Not sent",
        description: "Say why it was declined. The customer sees this.",
      });
      return;
    }

    setBusy(status);
    try {
      await apiFetch<ApiSuccessResponse<CarEnquiryRow>>(
        `/api/admin/cars/enquiries/${enquiry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            admin_response: hasWords ? reply.trim() : null,
            quoted_pesewas: quoted.pesewas,
          }),
        },
      );

      toast.success({
        title: SENT_TITLE[status],
        description: SENT_BODY[status],
      });
      startTransition(() => router.refresh());
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 409) {
        toast.info({
          title: "Someone else answered this one",
          description: "The queue is being refreshed.",
        });
        startTransition(() => router.refresh());
        return;
      }
      toast.error({
        title: "Could not send that",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-[18px] border p-4 sm:p-5",
        enquiry.status === CAR_ENQUIRY_STATUSES.OPEN
          ? "border-tm-coral/25 bg-card"
          : "border-tm-border bg-card",
      )}
    >
      {/* ── Who, about what ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AdminBadge tone={STATUS_TONE[enquiry.status] ?? "neutral"}>
              {STATUS_LABEL[enquiry.status] ?? enquiry.status}
            </AdminBadge>
            <AdminBadge tone={isOffer ? "amber" : "neutral"}>
              {isOffer ? "Offer" : "Price request"}
            </AdminBadge>
            <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
              {formatAdminDateTime(enquiry.created_at) ?? "Just now"}
            </span>
          </div>

          <p className="min-w-0 text-[14.5px] leading-[1.35] font-semibold text-tm-ink">
            {car ? (
              <Link
                href={`/admin/cars/${car.id}`}
                className="underline-offset-2 hover:underline"
              >
                {car.title}
              </Link>
            ) : (
              "A listing that no longer exists"
            )}
          </p>

          <p className="min-w-0 text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
            From{" "}
            <Link
              href={`/admin/users/${customer.id}`}
              className="font-semibold text-tm-ink underline-offset-2 hover:underline"
            >
              {customer.name ?? customer.email ?? "a customer"}
            </Link>
            {customer.name && customer.email ? (
              <>
                {" · "}
                <span className="tm-nums">{customer.email}</span>
              </>
            ) : null}
            {car && !car.isPublished ? (
              <>
                {" · "}
                <span className="font-semibold text-tm-amber">
                  this car is no longer on the site
                </span>
              </>
            ) : null}
          </p>
        </div>

        {isOffer && enquiry.offer_pesewas !== null ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
              They offered
            </span>
            <span className="tm-nums font-display text-[22px] leading-none font-bold text-tm-ink">
              {formatPesewas(enquiry.offer_pesewas)}
            </span>
            {car?.pricePesewas != null ? (
              <span className="text-[12px] leading-none font-medium text-tm-text-3">
                {describeGap(enquiry.offer_pesewas, car.pricePesewas)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── What they said ────────────────────────────────────────────── */}
      {enquiry.message ? (
        <blockquote className="min-w-0 border-l-2 border-tm-coral/35 pl-3 text-[13.5px] leading-[1.55] font-medium break-words text-tm-ink">
          {enquiry.message}
        </blockquote>
      ) : (
        <p className="text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
          {isOffer
            ? "No message — just the figure."
            : "No message. They simply want to know what it costs."}
        </p>
      )}

      {/* ── What was already said back ────────────────────────────────── */}
      {/*
        ONLY WHEN THERE IS SOMETHING TO SHOW. Accepting an offer needs neither a
        figure nor a reply (`answerCarEnquirySchema` requires words only to
        decline), so keying this block off `answered_at` alone drew an empty
        panel with a date in it under every accepted row. The outcome is already
        carried by the badge; what belongs here is what the customer actually
        read, and when there is none of that it is one line, not a panel.
      */}
      {enquiry.answered_at && (enquiry.quoted_pesewas !== null || enquiry.admin_response) ? (
        <div className="min-w-0 rounded-[14px] bg-tm-paper px-4 py-3">
          <p className="text-[11.5px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
            What the customer was told
          </p>
          <div className="mt-2 flex min-w-0 flex-col gap-1.5">
            {enquiry.quoted_pesewas !== null ? (
              <p className="tm-nums text-[14px] leading-none font-bold text-tm-ink">
                Quoted {formatPesewas(enquiry.quoted_pesewas)}
              </p>
            ) : null}
            {enquiry.admin_response ? (
              <p className="min-w-0 text-[13px] leading-[1.5] break-words whitespace-pre-wrap text-tm-text-2">
                {enquiry.admin_response}
              </p>
            ) : null}
            <p className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
              {formatAdminDateTime(enquiry.answered_at)}
            </p>
          </div>
        </div>
      ) : enquiry.answered_at ? (
        <p className="tm-nums text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
          {STATUS_LABEL[enquiry.status] ?? enquiry.status}{" "}
          {formatAdminDateTime(enquiry.answered_at)} · nothing was written back.
        </p>
      ) : null}

      {/* ── Answering ─────────────────────────────────────────────────── */}
      {answerable ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,200px)_1fr]">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[12px] leading-none font-semibold text-tm-text-2">
                {isOffer ? "Counter with" : "Quote"}
              </span>
              <span className="flex items-stretch overflow-hidden rounded-[12px] border border-tm-border bg-card focus-within:border-tm-coral/50 focus-within:ring-2 focus-within:ring-tm-coral/15">
                <span className="flex shrink-0 items-center border-r border-tm-hairline bg-tm-paper px-2.5 text-[13px] font-semibold text-tm-text-3 select-none">
                  GH₵
                </span>
                <input
                  inputMode="decimal"
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                  placeholder="184500"
                  disabled={busy !== null}
                  className="tm-nums h-10 min-w-0 flex-1 bg-card px-3 text-[14px] font-semibold text-tm-ink outline-none placeholder:font-normal placeholder:text-tm-text-3 disabled:opacity-60"
                />
              </span>
            </label>

            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[12px] leading-none font-semibold text-tm-text-2">
                Reply {isOffer ? "(required to decline)" : ""}
              </span>
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                rows={2}
                maxLength={2000}
                disabled={busy !== null}
                placeholder={
                  isOffer
                    ? "What you are agreeing to, or why not. The customer reads this word for word."
                    : "Anything the figure does not say on its own — what it includes, how long it holds."
                }
                className="min-h-[64px] w-full resize-y rounded-[12px] border-tm-border bg-card text-[13px] leading-[1.5] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
              />
            </label>
          </div>

          {!quoted.ok ? (
            <p role="status" className="text-[12.5px] leading-[1.45] font-semibold text-tm-coral-strong">
              {quoted.problem}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AdminButton
              variant="primary"
              busy={busy === CAR_ENQUIRY_STATUSES.ANSWERED}
              disabled={busy !== null || (!hasWords && quotedPesewas === null)}
              onClick={() => answer("answered")}
            >
              <SendIcon className="size-3.5" aria-hidden />
              {isOffer ? "Send a counter" : "Send the price"}
            </AdminButton>

            {isOffer ? (
              <>
                <AdminButton
                  variant="secondary"
                  busy={busy === CAR_ENQUIRY_STATUSES.ACCEPTED}
                  disabled={busy !== null}
                  onClick={() => answer("accepted")}
                >
                  <CheckIcon className="size-3.5" aria-hidden />
                  Accept the offer
                </AdminButton>
                <AdminButton
                  variant="danger"
                  busy={busy === CAR_ENQUIRY_STATUSES.DECLINED}
                  disabled={busy !== null || !hasWords}
                  onClick={() => answer("declined")}
                >
                  <XIcon className="size-3.5" aria-hidden />
                  Decline
                </AdminButton>
              </>
            ) : null}
          </div>

          <p className="max-w-[72ch] text-[12px] leading-[1.45] font-medium text-tm-text-3">
            {isOffer
              ? // The single most important sentence on this screen. Accepting is
                // a record that a person agreed, not a sale: there is no order,
                // no payment and no state machine behind it.
                "Accepting records that you agreed to this figure. It takes no money and creates no order — you and the customer carry on from there. Declining needs a reason, because they read it."
              : "The price you send appears on the customer's enquiry. Nothing is charged and nothing is reserved."}
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
          This enquiry is {STATUS_LABEL[enquiry.status]?.toLowerCase() ?? enquiry.status} and
          cannot be reopened. If the customer wants to try again, they make a fresh offer.
        </p>
      )}
    </li>
  );
}

// ── Words ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  open: "Waiting",
  answered: "Answered",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/**
 * Coral for "waiting" because a person owes somebody an action; green for
 * accepted because it is settled; amber for answered because the ball is in the
 * customer's court and it may yet come back.
 */
const STATUS_TONE: Record<string, AdminTone> = {
  open: "coral",
  answered: "amber",
  accepted: "green",
  declined: "muted",
  withdrawn: "muted",
};

type AnswerStatus = "answered" | "accepted" | "declined";

const SENT_TITLE: Record<AnswerStatus, string> = {
  answered: "Answer sent",
  accepted: "Offer accepted",
  declined: "Offer declined",
};

const SENT_BODY: Record<AnswerStatus, string> = {
  answered: "The customer can see your reply on their enquiry.",
  // Says what it is, and refuses to imply what it is not.
  accepted: "Recorded that you agreed. No money has been taken and no order exists.",
  declined: "The customer has been told, with your reason.",
};

/** "GH₵15,000 under the asking price" — the figure an admin actually weighs. */
function describeGap(offer: number, asking: number): string {
  const difference = asking - offer;
  if (difference === 0) return "the full asking price";
  return difference > 0
    ? `${formatPesewas(difference)} under the asking price`
    : `${formatPesewas(-difference)} over the asking price`;
}
