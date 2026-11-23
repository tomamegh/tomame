"use client";

import { CheckCircle, DeviceMobile, LockSimple } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";

export type PaymentHandoffKind = "paystack" | "momo" | "paid";

const COPY: Record<PaymentHandoffKind, { title: string; body: string }> = {
  paystack: { title: "Taking you to Paystack", body: "Your bag is safe. Paystack's secure page opens in a moment." },
  momo: { title: "Sending the prompt to your phone", body: "Keep your phone close. You'll approve it with your MoMo PIN." },
  paid: { title: "Payment received", body: "Opening your order…" },
};

/**
 * The moment between pressing Pay and the next screen (Paystack's page, the
 * MoMo prompt, or the paid order). Checkout empties the bag on the way, so
 * without this the customer watched their bag go blank for a second or two and
 * wondered what had happened to it. Covers the whole viewport, above sheets and
 * dialogs, and does not animate for anyone who asked for reduced motion.
 */
export function PaymentHandoffOverlay({ kind, totalGhs }: { kind: PaymentHandoffKind | null; totalGhs: number | null }) {
  if (!kind) return null;
  const copy = COPY[kind];
  const Icon = kind === "paid" ? CheckCircle : kind === "momo" ? DeviceMobile : LockSimple;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="payment-handoff"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 px-6 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="flex max-w-[340px] flex-col items-center gap-5 text-center">
        <div className="relative flex size-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-tm-coral/15 motion-safe:animate-ping [animation-duration:1.6s]" aria-hidden />
          <span className="absolute inset-2 rounded-full bg-tm-coral/10" aria-hidden />
          <span
            className={cn(
              "absolute inset-3 rounded-full border-[3px] border-tm-coral/20 border-t-tm-coral",
              kind !== "paid" && "motion-safe:animate-spin [animation-duration:0.9s]",
            )}
            aria-hidden
          />
          <Icon weight={kind === "paid" ? "fill" : "duotone"} className={cn("relative size-9", kind === "paid" ? "text-tm-green" : "text-tm-coral")} aria-hidden />
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-display text-xl leading-tight font-bold">{copy.title}</p>
          {totalGhs != null && kind !== "paid" && (
            <p className="tm-nums text-[15px] leading-none font-semibold text-tm-text-2">{formatGhs(totalGhs)}</p>
          )}
          <p className="text-[14px] leading-[1.5] text-muted-foreground">{copy.body}</p>
        </div>
      </div>
    </div>
  );
}
