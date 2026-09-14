"use client";

import { useCallback, useState } from "react";
import { CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react/ssr";

import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";
import type { OrderFeedback } from "@/features/feedback/types";
import type { OrderPhotoView } from "@/features/order-photos/types";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import {
  feedbackStatusLabel,
  feedbackStatusNote,
  feedbackVerdictLabel,
  formatEventStamp,
  isFeedbackComplaint,
} from "../format";
import {
  notifyFeedbackError,
  useOrderFeedback,
  useSubmitOrderFeedback,
} from "../hooks/useOrderFeedback";
import { JourneyFeedbackDialog } from "./journey-feedback-dialog";

export interface JourneyFeedbackProps {
  orderId: string;
  /** The photographs this answer is about, newest first. */
  photos: OrderPhotoView[];
  /**
   * Whether to put the question. False when nothing has been photographed:
   * asking "is this what you ordered?" beside no picture is asking about
   * nothing. What the customer has ALREADY said is still shown either way — it
   * does not stop being true because a photo was later hidden.
   */
  ask: boolean;
}

/**
 * "Is this what you ordered?" — and what we said back.
 *
 * The photograph alone is just a picture. This is the half that matters: the
 * parcel is sitting at a US hub, not in the air, so a mistake caught here costs
 * a swap rather than a second shipment in both directions.
 *
 * TWO ANSWERS, DELIBERATELY UNEQUAL IN WEIGHT. "Yes, that is it" is one tap on
 * a solid, positive button and needs no words — a customer confirming the photo
 * is the single most useful signal the feature produces, and making them fill in
 * a form would lose it. A complaint opens a dialog, because it needs a verdict
 * and a sentence a person can act on. Neither reads as "file a complaint".
 *
 * Once they have spoken the ask is GONE, replaced by what they said, where it
 * has got to, and our answer when one exists. Re-offering the form as if
 * nothing had happened is how a customer ends up saying the same thing three
 * times.
 */
export function JourneyFeedback({ orderId, photos, ask }: JourneyFeedbackProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const feedback = useOrderFeedback(orderId);
  const submit = useSubmitOrderFeedback(orderId);

  const said = feedback.data ?? [];
  const confirming = submit.isPending && submit.variables?.verdict === "looks_right";

  const confirm = useCallback(() => {
    submit.mutate(
      { verdict: "looks_right", photo_id: photos[0]?.id ?? null },
      {
        onSuccess: () =>
          toast.success({
            title: "Thank you",
            description: "We have noted that the photo looks right to you.",
          }),
        onError: notifyFeedbackError,
      },
    );
  }, [photos, submit]);

  // Nothing is drawn until we know whether they have already spoken: showing
  // the ask and then swapping it for their own words is worse than a beat of
  // nothing, and would invite a duplicate from a fast tap.
  if (feedback.isLoading) {
    return ask ? (
      <p className="text-[13px] leading-[1.5] text-tm-text-3" aria-busy>
        Loading what you have told us…
      </p>
    ) : null;
  }

  // No picture and nothing said: the card is the honest sentence alone.
  if (!ask && said.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {said.length > 0 ? (
        <>
          <ul aria-live="polite" className="flex min-w-0 flex-col gap-2.5">
            {said.map((row) => (
              <FeedbackEntry key={row.id} feedback={row} />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="w-fit text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
          >
            Tell us something else about this parcel
          </button>
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-tm-border bg-tm-paper p-4">
          <div className="min-w-0">
            <p className="text-sm leading-none font-semibold">Is this what you ordered?</p>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-tm-text-2">
              It is still at our US hub. If we have bought the wrong thing, telling us now
              is the cheapest moment to fix it.
            </p>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={confirm}
              disabled={submit.isPending}
              aria-busy={confirming}
              className={cn(
                "flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] bg-tm-green-ink px-3 text-[15px] leading-none font-bold text-white",
                "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {confirming ? (
                <SpinnerGap className="size-[18px] shrink-0 animate-spin" aria-hidden />
              ) : (
                <CheckCircle weight="fill" className="size-[18px] shrink-0" aria-hidden />
              )}
              Yes, that is it
            </button>

            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={submit.isPending}
              className={cn(
                "flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-3 text-[15px] leading-none font-semibold",
                "transition-colors hover:bg-tm-tint disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <WarningCircle weight="duotone" className="size-[18px] shrink-0 text-tm-amber" aria-hidden />
              Something is wrong
            </button>
          </div>
        </div>
      )}

      <JourneyFeedbackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orderId={orderId}
        photos={photos}
      />
    </div>
  );
}

/** The chip beside a complaint. A confirmation carries none — it is not a ticket. */
const STATUS_CHIP: Record<OrderFeedbackStatus, string> = {
  open: "bg-tm-amber-bg text-tm-amber",
  in_review: "bg-tm-amber-bg text-tm-amber",
  resolved: "bg-tm-green-bg text-tm-green-ink",
  dismissed: "bg-tm-pill-bg text-tm-text-2",
};

/** One thing the customer said, and how it was answered. */
function FeedbackEntry({ feedback }: { feedback: OrderFeedback }) {
  const complaint = isFeedbackComplaint(feedback.verdict);
  const stamp = formatEventStamp(feedback.created_at);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[18px] border p-4",
        complaint ? "border-tm-border bg-tm-paper" : "border-tm-green-bg bg-tm-green-bg",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] leading-none font-bold">
          {complaint ? (
            <WarningCircle weight="fill" className="size-4 shrink-0 text-tm-amber" aria-hidden />
          ) : (
            <CheckCircle weight="fill" className="size-4 shrink-0 text-tm-green-ink" aria-hidden />
          )}
          <span className="min-w-0 break-words">{feedbackVerdictLabel(feedback.verdict)}</span>
        </span>

        {complaint && (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold whitespace-nowrap",
              STATUS_CHIP[feedback.status],
            )}
          >
            {feedbackStatusLabel(feedback.status)}
          </span>
        )}

        {stamp && <span className="text-xs leading-none text-tm-text-3">{stamp}</span>}
      </div>

      <p className="min-w-0 text-[13px] leading-[1.5] break-words text-tm-text-2">
        &ldquo;{feedback.message}&rdquo;
      </p>

      <p className="min-w-0 text-[13px] leading-[1.5] break-words text-tm-text-2">
        {feedbackStatusNote(feedback.verdict, feedback.status)}
      </p>

      {/*
        The resolution is the half of the loop that reaches the customer. An
        objection answered only inside the admin console is an objection the
        person who raised it never hears about.
      */}
      {feedback.resolution && (
        <p className="min-w-0 rounded-xl border border-tm-border bg-card px-3.5 py-3 text-[13px] leading-[1.5] break-words text-tm-text-2">
          <b className="text-tm-ink">What we did:</b> {feedback.resolution}
        </p>
      )}
    </li>
  );
}
