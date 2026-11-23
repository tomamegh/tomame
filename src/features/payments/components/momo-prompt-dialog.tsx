"use client";

import { useState } from "react";
import { CheckCircle, DeviceMobile, WarningCircle } from "@phosphor-icons/react/ssr";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import type { MomoPaymentState } from "../momo";

export interface MomoPromptDialogProps {
  momo: MomoPaymentState | null;
  /** The amount being charged, GHS — display only; the server charged it. */
  totalGhs: number | null;
  /** "055 123 4987" as the customer typed it. */
  phone: string;
  /** "MTN MoMo" — the network they picked. */
  networkLabel: string | null;
  slow: boolean;
  otpBusy: boolean;
  onCheck: () => void;
  onSubmitOtp: (otp: string) => void;
  onDismiss: () => void;
  /** Null when no card channel is offered. */
  onSwitchToCard: (() => void) | null;
}

const PRIMARY = cn(
  "tm-cta-gradient flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
  "transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60",
);
const SECONDARY =
  "flex h-[44px] w-full items-center justify-center rounded-[14px] border border-tm-border text-[14px] leading-none font-semibold text-tm-text-2 hover:bg-muted";

/**
 * The Mobile Money prompt, on the bag (Seamless Roadmap, Initiative 1).
 *
 * Pay has already sent the prompt; this says where it went and waits. It never
 * decides the outcome: every state comes from the server, which settles the
 * payment with Paystack. Closing it leaves an open prompt open — Pay resumes
 * that same prompt rather than sending a second one.
 */
export function MomoPromptDialog({
  momo,
  totalGhs,
  phone,
  networkLabel,
  slow,
  otpBusy,
  onCheck,
  onSubmitOtp,
  onDismiss,
  onSwitchToCard,
}: MomoPromptDialogProps) {
  const [otp, setOtp] = useState("");
  const amount = totalGhs != null ? formatGhs(totalGhs) : "the total";
  const to = [phone, networkLabel ? `(${networkLabel})` : null].filter(Boolean).join(" ");

  return (
    <Dialog open={momo != null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-[420px] rounded-[24px] p-6" data-testid="momo-prompt">
        {momo?.state === "failed" ? (
          <>
            <DialogHeader>
              <WarningCircle weight="fill" className="size-9 text-tm-amber" aria-hidden />
              <DialogTitle className="font-display text-xl">Payment not approved</DialogTitle>
              <DialogDescription className="text-[14px] leading-[1.5]">{momo.message}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2.5 pt-2">
              <button type="button" className={PRIMARY} onClick={onDismiss}>
                Try again
              </button>
              {onSwitchToCard && (
                <button type="button" className={SECONDARY} onClick={onSwitchToCard}>
                  Pay by card instead
                </button>
              )}
            </div>
          </>
        ) : momo?.state === "paid" ? (
          <DialogHeader>
            <CheckCircle weight="fill" className="size-9 text-tm-green" aria-hidden />
            <DialogTitle className="font-display text-xl">Payment received</DialogTitle>
            <DialogDescription className="text-[14px] leading-[1.5]">Opening your order…</DialogDescription>
          </DialogHeader>
        ) : momo?.state === "otp" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (otp.trim()) onSubmitOtp(otp.trim());
            }}
          >
            <DialogHeader>
              <DeviceMobile weight="duotone" className="size-9 text-tm-coral" aria-hidden />
              <DialogTitle className="font-display text-xl">Enter the code from your network</DialogTitle>
              <DialogDescription className="text-[14px] leading-[1.5]">{momo.message}</DialogDescription>
            </DialogHeader>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Code from the text message"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
              className="h-12 rounded-[14px] text-center text-lg tracking-[0.3em]"
            />
            <button type="submit" className={PRIMARY} disabled={otpBusy || otp.trim().length < 4}>
              {otpBusy ? <Spinner className="size-4" /> : "Continue"}
            </button>
          </form>
        ) : momo?.state === "approve" ? (
          <>
            <DialogHeader>
              <DeviceMobile weight="duotone" className="size-9 text-tm-coral" aria-hidden />
              <DialogTitle className="font-display text-xl">Approve {amount} on your phone</DialogTitle>
              <DialogDescription className="text-[14px] leading-[1.5]">
                We sent a Mobile Money prompt to <span className="font-semibold text-foreground">{to}</span>. Enter your PIN on your phone to approve it.
              </DialogDescription>
            </DialogHeader>
            <p role="status" className="flex items-center gap-2 rounded-[14px] bg-muted px-3.5 py-3 text-[13px] leading-[1.4] font-medium text-tm-text-2">
              <Spinner className="size-4 shrink-0" />
              {slow
                ? "Still waiting. If no prompt came, check the number and network, then close this and try again."
                : "Waiting for your approval. This page updates by itself."}
            </p>
            <div className="flex flex-col gap-2.5">
              <button type="button" className={PRIMARY} onClick={onCheck}>
                I&apos;ve approved it
              </button>
              <button type="button" className={SECONDARY} onClick={onDismiss}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
