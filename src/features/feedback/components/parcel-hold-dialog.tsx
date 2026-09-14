"use client";

import { useEffect, useState } from "react";

import { AdminButton } from "@/components/layout/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * "Stop this parcel" — and "let it go again".
 *
 * Kelvin's decision: an objection never pauses anything on its own, an admin
 * decides per case. This dialog IS that decision, which is why it is a dialog
 * and not a button: a hold has to be argued for in a sentence before it happens.
 *
 * WHY NOT `AdminConfirm`. The kit's confirmation takes a `consequence` and no
 * input, and a hold cannot be placed without a reason — the column CHECK
 * `orders_hold_has_reason` refuses one, so a button that only asked "are you
 * sure?" would round-trip to a 400 every time. The reason is the confirmation.
 *
 * Two modes in one component because they are the same shape with opposite
 * meanings, and splitting them would leave two dialogs to keep in step. The
 * difference that matters is enforced below: holding demands words, releasing
 * does not.
 */

/** The route's own bounds: `reason` is required, 3–500 characters. */
const REASON_MIN = 3;
const TEXT_MAX = 500;

const FIELD = cn(
  "min-h-[88px] resize-y rounded-[14px] border-tm-border bg-card px-3.5 py-3",
  "text-[14px] leading-[1.55] shadow-none",
  "focus-visible:border-tm-border focus-visible:ring-2 focus-visible:ring-tm-coral/20",
  "aria-invalid:border-tm-amber aria-invalid:ring-2 aria-invalid:ring-tm-amber/20",
);

export interface ParcelHoldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "hold" | "release";
  /** How this parcel is referred to on screen — the short order reference. */
  orderRef: string;
  /** The reason the hold is standing on, when the server has told us one. */
  standingReason?: string | null;
  busy?: boolean;
  /** Confirms with the typed text: the reason when holding, the note when releasing. */
  onConfirm: (text: string) => void;
}

export function ParcelHoldDialog({
  open,
  onOpenChange,
  mode,
  orderRef,
  standingReason,
  busy = false,
  onConfirm,
}: ParcelHoldDialogProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Cleared on the way IN rather than the way out, so the words do not flash
  // away while the dialog is still animating closed — and so reopening on a
  // different parcel can never inherit the last one's reason.
  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
    }
  }, [open, mode]);

  const holding = mode === "hold";

  const submit = () => {
    const trimmed = text.trim();
    // Checked here as well as on the server so a two-character reason is
    // answered instantly. The server's copy is the one that counts.
    if (holding && trimmed.length < REASON_MIN) {
      setError("Say why this parcel is being stopped. The customer will be asked.");
      return;
    }
    setError(null);
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px] border-tm-border sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-tight font-bold">
            {holding ? "Stop this parcel?" : "Let this parcel go?"}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] text-tm-text-2">
            {holding ? (
              <>
                Order <span className="tm-nums font-semibold">{orderRef}</span> will refuse to
                advance until somebody lifts the hold. Its status does not change; it simply stops
                moving.
              </>
            ) : (
              <>
                Order <span className="tm-nums font-semibold">{orderRef}</span> may move again.
                Lifting the hold does not advance it; that is a separate decision on the order
                itself.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!holding && standingReason ? (
          <p className="rounded-[14px] bg-tm-paper px-3.5 py-3 text-[13px] leading-[1.5] font-medium text-tm-text-2">
            <span className="font-semibold text-tm-ink">It was stopped for:</span> {standingReason}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="parcel-hold-text" className="text-[13px] leading-none font-semibold">
            {holding ? "Why are you stopping it?" : "What settled it? (optional)"}
          </Label>
          <Textarea
            id="parcel-hold-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            maxLength={TEXT_MAX}
            aria-invalid={!!error}
            aria-describedby={error ? "parcel-hold-error" : undefined}
            placeholder={
              holding
                ? "e.g. Customer says the photo shows the 128GB, they paid for the 256GB. Do not ship until checked."
                : "e.g. Photographed again, it is the right one. Customer is happy."
            }
            className={FIELD}
          />
          {error ? (
            <p
              id="parcel-hold-error"
              role="alert"
              className="text-xs leading-[1.4] font-medium text-tm-amber"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminButton variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton variant={holding ? "danger" : "primary"} busy={busy} onClick={submit}>
            {holding ? "Put it on hold" : "Lift the hold"}
          </AdminButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
