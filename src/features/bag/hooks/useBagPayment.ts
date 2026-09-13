"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useInitializePayment } from "@/features/payments/hooks/usePayment";
import type { PaymentChannel } from "@/features/payments/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { useCheckout } from "./useBag";

const LOGIN_HREF = `/auth/login?next=${encodeURIComponent("/app/bag")}`;

export interface UseBagPaymentOptions {
  isSignedIn: boolean;
  /** `site_settings.payment_channels`; the first is pre-selected. */
  channels: PaymentChannel[];
}

export interface BagPayment {
  /** The selected channel's id, or null when the admin has configured none. */
  channelId: string | null;
  setChannelId: (id: string) => void;
  /** True while either server call is in flight — every pay control disables together. */
  busy: boolean;
  /** Check the open bag out into an order group, then open the Paystack transaction for it. */
  payBag: () => void;
  /** Re-open a transaction for an order group that was checked out but never paid. */
  payGroup: (orderGroupId: string) => void;
}

/**
 * Paying, shared by every control that can start it.
 *
 * The desktop rail and the 390px bottom bar are two renderings of one action,
 * and the channel the customer picked in the rail must be the channel the bar
 * pays with — so the selection and the two mutations live here, above both, in
 * `BagView`. Nothing in this hook does money arithmetic: checkout re-prices the
 * bag server-side and initialize reads the group's own `total_pesewas`, so the
 * browser only carries ids between two server calls.
 *
 * A signed-out viewer is sent to sign in rather than shown a dead button: the
 * bag itself is public (the quote flow is), and checkout is where sign-in is
 * asked for.
 */
export function useBagPayment({
  isSignedIn,
  channels,
}: UseBagPaymentOptions): BagPayment {
  const router = useRouter();
  const checkout = useCheckout();
  const initializePayment = useInitializePayment();
  const [channelId, setChannelId] = useState<string | null>(
    channels[0]?.id ?? null,
  );

  const onError = useCallback(
    (title: string) => (error: Error) => {
      if (error instanceof ApiFetchError && error.status === 401) {
        router.push(LOGIN_HREF);
        return;
      }
      toast.error({ title, description: error.message });
    },
    [router],
  );

  const openTransaction = useCallback(
    (orderGroupId: string) => {
      initializePayment.mutate(
        { orderGroupId, channel: channelId ?? undefined },
        {
          // Paystack owns the next screen; a full navigation, not a router push.
          onSuccess: (payment) =>
            window.location.assign(payment.authorizationUrl),
          onError: onError("Could not start the payment"),
        },
      );
    },
    [channelId, initializePayment, onError],
  );

  const payBag = useCallback(() => {
    if (!isSignedIn) {
      router.push(LOGIN_HREF);
      return;
    }
    checkout.mutate(undefined, {
      onSuccess: (result) => openTransaction(result.order_group_id),
      onError: onError("Could not start checkout"),
    });
  }, [checkout, isSignedIn, onError, openTransaction, router]);

  return {
    channelId,
    setChannelId,
    busy: checkout.isPending || initializePayment.isPending,
    payBag,
    payGroup: openTransaction,
  };
}
