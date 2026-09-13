"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useInitializePayment } from "@/features/payments/hooks/usePayment";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";

export interface JourneyPaymentTarget {
  /** The row being paid for, so the caller can disable just that card. */
  id: string;
  /** Present when the order was one line of a bag: the group pays, not the line. */
  orderGroupId: string | null;
}

export interface JourneyPaymentControls {
  /** The row currently opening a transaction, or null. */
  busyId: string | null;
  pay: (target: JourneyPaymentTarget) => void;
}

/**
 * "Pay now", from a journey row or the detail screen.
 *
 * Sends ids only. The amount is the group's own `total_pesewas` (or the order's
 * server-side pricing) — the browser never names a figure, so a tampered request
 * cannot change what is charged.
 *
 * An order bought as part of a bag pays as its GROUP: charging one line would
 * split the total and leave the group half-paid, and the service rejects it
 * outright. That is why `orderGroupId` wins whenever it is set.
 */
export function useJourneyPayment(): JourneyPaymentControls {
  const router = useRouter();
  const initializePayment = useInitializePayment();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pay = useCallback(
    (target: JourneyPaymentTarget) => {
      setBusyId(target.id);
      initializePayment.mutate(
        target.orderGroupId ? { orderGroupId: target.orderGroupId } : { orderId: target.id },
        {
          // Paystack owns the next screen: a full navigation, not a router push.
          onSuccess: (payment) => window.location.assign(payment.authorizationUrl),
          onError: (error: Error) => {
            setBusyId(null);
            // The session can lapse while a list sits open; sending them to sign
            // in is more useful than a toast saying "Unauthorized".
            if (error instanceof ApiFetchError && error.status === 401) {
              router.push(`/auth/login?next=${encodeURIComponent("/app/orders")}`);
              return;
            }
            toast.error({
              title: "Could not start the payment",
              description: error.message,
            });
          },
        },
      );
    },
    [initializePayment, router],
  );

  return { busyId, pay };
}

/**
 * "Buy again" — the quote flow with the same link, not a silent re-order.
 *
 * The price, the exchange rate and the freight band have all moved since the
 * original purchase, so the customer is taken back through the landed-price
 * screen and sees what it costs TODAY before anything is added to a bag.
 */
export function buyAgainHref(productUrl: string): string {
  return `/app/orders/new?url=${encodeURIComponent(productUrl)}`;
}
