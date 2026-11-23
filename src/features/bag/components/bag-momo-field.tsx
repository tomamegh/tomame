"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BagPayment } from "../hooks/useBagPayment";

/**
 * The Mobile Money number Pay sends the prompt to (Seamless Roadmap,
 * Initiative 1). Pre-filled from the remembered number, else the account
 * phone, so a returning customer types nothing. The tick is the consent to
 * remember it; unticking it forgets a saved number on the next payment.
 */
export function BagMomoField({ payment }: { payment: BagPayment }) {
  if (!payment.showMomoField) return null;
  const invalid = payment.momoPhone.trim().length > 0 && !payment.momoReady;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="bag-momo-phone" className="text-[13px] leading-none font-semibold text-tm-text-2">
        Mobile Money number
      </label>
      <Input
        id="bag-momo-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="024 412 3456"
        value={payment.momoPhone}
        disabled={payment.busy}
        aria-invalid={invalid || undefined}
        aria-describedby="bag-momo-hint"
        onChange={(event) => payment.setMomoPhone(event.target.value)}
        className={cn(
          "tm-nums h-[46px] rounded-xl border-tm-border bg-card px-3.5 text-[16px] shadow-none",
          "focus-visible:ring-2 focus-visible:ring-tm-coral/20 aria-invalid:border-tm-amber",
        )}
      />
      <p id="bag-momo-hint" className={cn("text-xs leading-[1.4]", invalid ? "text-tm-amber" : "text-tm-text-3")}>
        {invalid ? "Enter a Ghana number, like 024 412 3456." : "Pay sends the prompt to this phone. Approve it with your PIN."}
      </p>
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.4] font-medium text-tm-text-2">
        <input
          type="checkbox"
          checked={payment.rememberMomo}
          onChange={(event) => payment.setRememberMomo(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-tm-coral"
        />
        Remember this number for my next order
      </label>
    </div>
  );
}
