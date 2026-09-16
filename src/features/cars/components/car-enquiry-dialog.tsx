"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneTilt, SpinnerGap } from "@phosphor-icons/react/ssr";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAR_ENQUIRY_KINDS, type CarEnquiryKind } from "@/config/constants";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import { formatPesewas } from "../format";
import type { CarEnquiryRow } from "../types";

/**
 * The v2 field look, copied from `journey-feedback-dialog.tsx` so the two
 * customer-facing dialogs in this app are one control rather than two: focus is
 * a soft ring over the ordinary border, and only `aria-invalid` takes a hard
 * colour — amber, which is what every other error in this app uses.
 */
const FIELD = cn(
  "rounded-[14px] border-tm-border bg-card px-3.5 py-3 text-[15px] leading-[1.5] shadow-none",
  "focus-visible:border-tm-border focus-visible:ring-2 focus-visible:ring-tm-coral/20",
  "aria-invalid:border-tm-amber aria-invalid:ring-2 aria-invalid:ring-tm-amber/20",
);

export interface CarEnquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carListingId: string;
  /** "2019 Toyota Highlander XLE" — said back so a customer with three tabs open knows which. */
  title: string;
  /** `offer` on a negotiable listing, `price_request` on an on-request one. Decided server-side too. */
  kind: CarEnquiryKind;
  /** The asking price in PESEWAS, for the offer form's context line. Null on an on-request car. */
  askingPesewas: number | null;
  /** Where to send a signed-out visitor back to after they sign in. */
  returnTo: string;
}

/**
 * "Make an offer" and "Ask for the price", which are the same form twice.
 *
 * ONE COMPONENT, NOT TWO, because the difference between them is exactly one
 * field. Splitting it would mean two dialogs, two submit paths and two places
 * for the amount rule to drift — and the amount rule is the whole point:
 * `car_enquiries_kind_amount` in the database refuses an offer with no amount
 * and a price request WITH one, `createCarEnquirySchema` refuses the same pair,
 * and this refuses it a third time before a round trip is spent.
 *
 * WHY THE THIRD CHECK IS WORTH HAVING. The route's budget is six enquiries an
 * hour (`RATE_LIMIT.assisted` — every row is a job a person has to work), so a
 * validation failure that travels to the server costs the customer one of six
 * attempts to be told something the form already knew. `JourneyFeedbackDialog`
 * makes the same argument for the same reason.
 *
 * THE CUSTOMER TYPES CEDIS AND THE WIRE CARRIES PESEWAS. Nobody offers
 * "18,500,000" for a car. The conversion is the only arithmetic in this file
 * and it is a unit change, not a price: the server re-reads the listing, checks
 * the price state against the kind and stores the integer. There is no total
 * being computed in a browser here.
 *
 * A signed-out visitor is sent to sign in rather than shown a dead button —
 * `/app/cars` is public precisely so that the listings can be read without an
 * account, and this is the moment an account is actually needed.
 */
export function CarEnquiryDialog({
  open,
  onOpenChange,
  carListingId,
  title,
  kind,
  askingPesewas,
  returnTo,
}: CarEnquiryDialogProps) {
  const router = useRouter();
  const isOffer = kind === CAR_ENQUIRY_KINDS.OFFER;
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const close = useCallback(
    (next: boolean) => {
      if (busy) return;
      onOpenChange(next);
      // Reset on the way out only, and a beat late, so the form does not empty
      // itself in front of the customer as the dialog animates away.
      if (!next) {
        setTimeout(() => {
          setAmount("");
          setMessage("");
          setError(null);
        }, 200);
      }
    },
    [busy, onOpenChange],
  );

  const onSubmit = useCallback(async () => {
    let offerPesewas: number | null = null;

    if (isOffer) {
      const cedis = Number(amount.replace(/,/g, "").trim());
      if (!Number.isFinite(cedis) || cedis <= 0) {
        setError("How much are you offering?");
        amountRef.current?.focus();
        return;
      }
      // Rounded to the pesewa, which is the smallest unit the column holds.
      // An offer of "185000.005" is a typo, not a bid.
      offerPesewas = Math.round(cedis * 100);
    } else if (message.trim().length === 0) {
      // A price request with no words is a row in the queue that says nothing
      // more than "somebody looked at this car". The buyer answering it has
      // nothing to answer, so the form asks for a sentence.
      setError("Tell us what you would like to know.");
      messageRef.current?.focus();
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await apiFetch<ApiSuccessResponse<CarEnquiryRow>>("/api/cars/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          car_listing_id: carListingId,
          kind,
          offer_pesewas: offerPesewas,
          message: message.trim() || null,
        }),
      });
      close(false);
      toast.success({
        title: isOffer ? "Your offer is with us" : "We have your question",
        description: "A buyer will come back to you about this car.",
      });
    } catch (caught) {
      if (caught instanceof ApiFetchError && caught.status === 401) {
        router.push(`/auth/login?next=${encodeURIComponent(returnTo)}`);
        return;
      }
      // The server's own sentence, not a status code: 409 here means "you
      // already have an offer open on this car", and 422 means the listing's
      // price state moved while the dialog was open. Both are things a
      // customer can act on, and both are already written in plain words by
      // `cars.service.ts`.
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "That did not send. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }, [amount, carListingId, close, isOffer, kind, message, returnTo, router]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-tight font-bold">
            {isOffer ? "Make an offer" : "Ask for the price"}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
            {isOffer
              ? `${title}. The asking price is ${
                  askingPesewas === null ? "not set" : formatPesewas(askingPesewas)
                } landed in Tema. Tell us what you would pay and a buyer will come back to you.`
              : `${title}. We have not put a figure on this one yet. Ask and a buyer will work out what it lands at.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          {isOffer && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label
                htmlFor="car-offer-amount"
                className="text-[13px] leading-none font-semibold"
              >
                Your offer, in cedis
              </Label>
              <Input
                id="car-offer-amount"
                ref={amountRef}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (error) setError(null);
                }}
                type="number"
                inputMode="decimal"
                min={1}
                step={100}
                placeholder="e.g. 175000"
                aria-invalid={!!error}
                aria-describedby={error ? "car-enquiry-error" : undefined}
                className={cn(FIELD, "tm-nums h-auto")}
              />
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="car-enquiry-message"
              className="text-[13px] leading-none font-semibold"
            >
              {isOffer ? "Anything we should know? (optional)" : "What would you like to know?"}
            </Label>
            <Textarea
              id="car-enquiry-message"
              ref={messageRef}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (error) setError(null);
              }}
              rows={3}
              maxLength={2000}
              placeholder={
                isOffer
                  ? "e.g. I can pay in full as soon as it lands"
                  : "e.g. What would this cost me landed in Tema, duty paid?"
              }
              aria-invalid={!isOffer && !!error}
              aria-describedby={error ? "car-enquiry-error" : undefined}
              className={FIELD}
            />
          </div>

          {error && (
            <p
              id="car-enquiry-error"
              role="alert"
              className="text-xs leading-[1.4] font-medium text-tm-amber"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            aria-busy={busy}
            className={cn(
              "tm-cta-gradient flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
              "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            )}
          >
            {busy ? (
              <SpinnerGap className="size-4 animate-spin" aria-hidden />
            ) : (
              <PaperPlaneTilt weight="fill" className="size-4" aria-hidden />
            )}
            {busy ? "Sending…" : isOffer ? "Send this offer" : "Send this question"}
          </button>

          <p className="text-[11.5px] leading-[1.4] font-medium text-tm-text-3">
            Nothing is charged by sending this. It starts a conversation with a
            buyer, and you agree a figure before any money moves.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
