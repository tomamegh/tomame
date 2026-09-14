"use client";

import { useCallback, useRef, useState } from "react";
import { PaperPlaneTilt, SpinnerGap } from "@phosphor-icons/react/ssr";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderFeedbackVerdict } from "@/db/queries/order-feedback";
import type { OrderFeedback } from "@/features/feedback/types";
import { submitOrderFeedbackSchema } from "@/features/feedback/schema";
import type { OrderPhotoView } from "@/features/order-photos/types";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/sonner";
import { photoKindLabel } from "../format";
import { notifyFeedbackError, useSubmitOrderFeedback } from "../hooks/useOrderFeedback";

/**
 * The four things that can be wrong, and what each one means in plain words.
 *
 * `looks_right` is deliberately NOT here. Confirming the photo is a single tap
 * on the card behind this dialog — routing it through a form with a required
 * message would cost us the signal the feature exists to collect.
 */
const COMPLAINTS: { verdict: OrderFeedbackVerdict; label: string; hint: string }[] = [
  { verdict: "wrong_item", label: "Wrong item", hint: "This is not the thing I asked for" },
  { verdict: "wrong_variant", label: "Wrong size or colour", hint: "Right thing, wrong version of it" },
  { verdict: "damaged", label: "Damaged", hint: "It is broken, torn or dented" },
  { verdict: "other", label: "Something else", hint: "None of the above" },
];

/**
 * The v2 field look, matching the assisted-request dialog: focus is a soft ring
 * over the ordinary border, and only `aria-invalid` takes a hard colour — amber,
 * which is what every other error in this app uses.
 */
const FIELD = cn(
  "rounded-[14px] border-tm-border bg-card px-3.5 py-3 text-[15px] leading-[1.5] shadow-none",
  "focus-visible:border-tm-border focus-visible:ring-2 focus-visible:ring-tm-coral/20",
  "aria-invalid:border-tm-amber aria-invalid:ring-2 aria-invalid:ring-tm-amber/20",
);

export interface JourneyFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Newest first. Used to say WHICH picture is being objected to. */
  photos: OrderPhotoView[];
  onSubmitted?: (feedback: OrderFeedback) => void;
}

/**
 * "That is not what I ordered."
 *
 * The parcel is at a US hub, which makes this the last moment a mistake is
 * cheap: a wrong item can be swapped before it flies rather than shipped twice.
 *
 * THE MESSAGE IS REQUIRED HERE, not by the server's 400. The route rejects a
 * complaint with a blank message ("Tell us what is wrong with it"), and a form
 * that let the request go out anyway would spend a round trip — and one of the
 * customer's six hourly attempts — to say what it could have said instantly.
 * The server's copy of the rule still stands; this one just gets there first.
 */
export function JourneyFeedbackDialog({
  open,
  onOpenChange,
  orderId,
  photos,
  onSubmitted,
}: JourneyFeedbackDialogProps) {
  const [verdict, setVerdict] = useState<OrderFeedbackVerdict>("wrong_item");
  const [message, setMessage] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const submit = useSubmitOrderFeedback(orderId);

  const close = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      // Reset on the way out only, and a beat late, so the form does not empty
      // itself in front of the customer as the dialog animates away.
      if (!next) {
        setTimeout(() => {
          setVerdict("wrong_item");
          setMessage("");
          setPhotoId(photos[0]?.id ?? null);
          setError(null);
        }, 200);
      }
    },
    [onOpenChange, photos],
  );

  const onSubmit = useCallback(() => {
    const parsed = submitOrderFeedbackSchema.safeParse({ verdict, message, photo_id: photoId });
    const typed = message.trim();

    if (!typed || !parsed.success) {
      setError(
        !typed
          ? "Tell us what is wrong with it"
          : (parsed.success ? null : parsed.error.issues[0]?.message) ?? "Check that and try again",
      );
      messageRef.current?.focus();
      return;
    }

    setError(null);
    submit.mutate(parsed.data, {
      onSuccess: (row) => {
        onSubmitted?.(row);
        close(false);
        toast.success({
          title: "We have it",
          description: "Someone will look at this before your parcel moves on.",
        });
      },
      onError: notifyFeedbackError,
    });
  }, [close, message, onSubmitted, photoId, submit, verdict]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-tight font-bold">
            What is wrong with it?
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
            Your parcel is still at our US hub, so this is the cheapest moment to put it
            right. Tell us what you see and a buyer will pick it up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {photos.length > 1 && (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-[13px] leading-none font-semibold">
                Which photo?
              </legend>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo) => (
                  <label
                    key={photo.id}
                    className={cn(
                      "relative flex size-16 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-[1.5px] bg-tm-tint transition-colors",
                      photo.id === photoId ? "border-tm-coral" : "border-tm-border",
                    )}
                  >
                    <input
                      type="radio"
                      name="feedback-photo"
                      className="sr-only"
                      checked={photo.id === photoId}
                      onChange={() => setPhotoId(photo.id)}
                    />
                    <img
                      src={photo.url}
                      alt={photoKindLabel(photo.kind)}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      decoding="async"
                      className="size-full min-w-0 object-cover"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[13px] leading-none font-semibold">
              What happened?
            </legend>
            {COMPLAINTS.map((option) => (
              <label
                key={option.verdict}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] p-3 transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tm-coral/30",
                  option.verdict === verdict
                    ? "border-tm-coral bg-tm-tint"
                    : "border-tm-border bg-card hover:bg-tm-pill-bg",
                )}
              >
                <input
                  type="radio"
                  name="feedback-verdict"
                  className="mt-0.5 size-4 shrink-0 accent-tm-coral"
                  checked={option.verdict === verdict}
                  onChange={() => setVerdict(option.verdict)}
                />
                <span className="min-w-0">
                  <span className="block text-sm leading-none font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-[1.4] text-tm-text-2">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="feedback-message" className="text-[13px] leading-none font-semibold">
              Tell us what you see
            </Label>
            <Textarea
              id="feedback-message"
              ref={messageRef}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (error) setError(null);
              }}
              rows={3}
              maxLength={2000}
              placeholder="e.g. I ordered the black one and this is grey"
              aria-invalid={!!error}
              aria-describedby={error ? "feedback-message-error" : undefined}
              className={FIELD}
            />
            {error && (
              <p
                id="feedback-message-error"
                role="alert"
                className="text-xs leading-[1.4] font-medium text-tm-amber"
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submit.isPending}
            aria-busy={submit.isPending}
            className={cn(
              "tm-cta-gradient flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
              "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submit.isPending ? (
              <SpinnerGap className="size-4 animate-spin" aria-hidden />
            ) : (
              <PaperPlaneTilt weight="fill" className="size-4" aria-hidden />
            )}
            {submit.isPending ? "Sending…" : "Send this to a buyer"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
