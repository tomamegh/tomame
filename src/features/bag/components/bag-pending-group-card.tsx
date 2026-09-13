"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Receipt } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";
import { useInitializePayment } from "@/features/payments/hooks/usePayment";
import type { PaymentChannel } from "@/features/payments/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { PendingGroupSummary } from "../types";

export interface BagPendingGroupCardProps {
  group: PendingGroupSummary;
  paymentChannels: PaymentChannel[];
}

/**
 * Checkout flips the cart before Paystack answers, so a declined payment lands
 * on an empty bag. This card is the way back: the unpaid group, its total from
 * `order_groups`, and one button that re-initialises the same group. Journeys
 * (Phase 5) will list the group too; until then this is the only retry.
 */
export function BagPendingGroupCard({ group, paymentChannels }: BagPendingGroupCardProps) {
  const router = useRouter();
  const initializePayment = useInitializePayment();
  const [channelId, setChannelId] = useState<string | null>(paymentChannels[0]?.id ?? null);

  const onPay = useCallback(() => {
    initializePayment.mutate(
      { orderGroupId: group.id, channel: channelId ?? undefined },
      {
        onSuccess: (payment) => window.location.assign(payment.authorizationUrl),
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 401) {
            router.push(`/auth/login?next=${encodeURIComponent("/app/bag")}`);
            return;
          }
          toast.error({ title: "Could not start the payment", description: error.message });
        },
      },
    );
  }, [channelId, group.id, initializePayment, router]);

  const n = group.item_count;
  return (
    <section
      data-testid="bag-pending-group"
      className="tm-up flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.08s] [animation-duration:0.5s]"
    >
      <div className="flex items-start gap-3">
        <Receipt weight="duotone" className="size-6 shrink-0 text-tm-coral" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg leading-none font-bold">Finish paying for your bag</h2>
          <p className="text-[13px] leading-[1.5] text-tm-text-2">
            {n} item{n === 1 ? "" : "s"} are waiting on payment. Nothing has been charged yet.
          </p>
        </div>
      </div>

      {paymentChannels.length > 0 && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pay with">
          {paymentChannels.map((channel) => {
            const selected = channel.id === channelId;
            return (
              <button
                key={channel.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setChannelId(channel.id)}
                className={
                  selected
                    ? "flex h-[46px] items-center justify-center gap-2 rounded-xl border-2 border-tm-coral bg-[#FFF8F5] text-[13px] leading-none font-semibold"
                    : "flex h-[46px] items-center justify-center gap-2 rounded-xl border border-tm-border text-[13px] leading-none font-semibold text-tm-text-2"
                }
              >
                {channel.dot && <span className="size-2.5 rounded-full" style={{ background: channel.dot }} aria-hidden />}
                {channel.label}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={initializePayment.isPending}
        className="tm-cta-gradient flex h-[54px] items-center justify-center gap-2 rounded-[14px] text-base leading-none font-bold text-white shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)] disabled:opacity-60"
      >
        {initializePayment.isPending ? "Redirecting to Paystack…" : `Pay ${formatGhs(group.total_ghs)}`}
        <ArrowRight weight="bold" className="size-4" aria-hidden />
      </button>
    </section>
  );
}
