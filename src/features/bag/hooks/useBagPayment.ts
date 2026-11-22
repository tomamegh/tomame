"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  fetchMomoPaymentState,
  useInitializePayment,
  useStartMomoPayment,
  useSubmitMomoOtp,
} from "@/features/payments/hooks/usePayment";
import { formatLocalGhanaPhone, type MomoPaymentState, type MomoPrefill } from "@/features/payments/momo";
import { normaliseGhanaPhone } from "@/features/order-delivery/schema";
import type { PaymentChannel } from "@/features/payments/types";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { useCheckout } from "./useBag";

const LOGIN_HREF = `/auth/login?next=${encodeURIComponent("/app/bag")}`;

export interface UseBagPaymentOptions {
  isSignedIn: boolean;
  /** `site_settings.payment_channels`; the prefilled number's network, else the first, is pre-selected. */
  channels: PaymentChannel[];
  /** The saved MoMo number, else the account phone; null when signed out. */
  momoPrefill?: MomoPrefill | null;
}

/** How long the dialog keeps asking before it says "still waiting" (the prompt itself times out sooner). */
const MOMO_POLL_MS = 4_000;
const MOMO_PATIENCE_MS = 3 * 60_000;

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
  /** The checkout tick: "Send me WhatsApp updates about my order". Off until ticked. */
  whatsappUpdates: boolean;
  setWhatsappUpdates: (value: boolean) => void;
  /** The selected channel is Mobile Money: Pay sends the prompt to `momoPhone`. */
  isMomo: boolean;
  /** Signed in and paying by MoMo: the number field shows. */
  showMomoField: boolean;
  /** False while a MoMo payment has no usable Ghana number; Pay waits for it. */
  momoReady: boolean;
  /** What the pay buttons say while `busy`. */
  busyLabel: string;
  /** The selected channel's label ("MTN MoMo"), for the prompt dialog. */
  channelLabel: string | null;
  momoPhone: string;
  setMomoPhone: (value: string) => void;
  /** The consent tick: remember this number for the next order. Off until ticked, unless already saved. */
  rememberMomo: boolean;
  setRememberMomo: (value: boolean) => void;
  /** The prompt in flight, or null. Drives `MomoPromptDialog`. */
  momo: MomoPaymentState | null;
  /** True once the prompt has waited `MOMO_PATIENCE_MS` without an outcome. */
  momoSlow: boolean;
  /** Ask the server now ("I've approved it"). */
  checkMomo: () => void;
  submitMomoOtp: (otp: string) => void;
  otpBusy: boolean;
  /** Close the dialog. A prompt still open stays open; Pay resumes it. */
  dismissMomo: () => void;
  /** After a decline: switch to the card channel, if one is offered. */
  switchToCard: (() => void) | null;
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
  momoPrefill = null,
}: UseBagPaymentOptions): BagPayment {
  const router = useRouter();
  const checkout = useCheckout();
  const initializePayment = useInitializePayment();
  const startMomo = useStartMomoPayment();
  const submitOtp = useSubmitMomoOtp();
  const [channelId, setChannelId] = useState<string | null>(
    () => channels.find((c) => c.paystack_channel === "mobile_money" && c.provider === momoPrefill?.provider)?.id ?? channels[0]?.id ?? null,
  );
  const channel = channels.find((c) => c.id === channelId) ?? null;
  const isMomo = channel?.paystack_channel === "mobile_money";
  const [momoPhone, setMomoPhone] = useState(() => (momoPrefill?.phone ? formatLocalGhanaPhone(momoPrefill.phone) : ""));
  const [rememberMomo, setRememberMomo] = useState(momoPrefill?.saved ?? false);
  const [momo, setMomo] = useState<MomoPaymentState | null>(null);
  const [momoSlow, setMomoSlow] = useState(false);
  const momoStartedAt = useRef(0);
  // Consent is explicit: unticked by default, and unticked means no automated WhatsApp.
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);

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

  // One outcome handler for the start, the status checks and the code.
  const onMomoState = useCallback((next: MomoPaymentState) => {
    if (next.state === "paid") {
      setMomo(next);
      // The same page Paystack's callback lands on: full navigation, so the
      // orders page renders the settled payment from the server.
      window.location.assign(next.redirectUrl);
      return;
    }
    setMomo(next);
    // Checkout already turned the bag into an unpaid group; re-read the page so
    // its "Finish paying" card is there to retry from once the dialog closes.
    if (next.state === "failed") router.refresh();
  }, [router]);

  const checkMomo = useCallback(() => {
    if (!momo || momo.state === "paid") return;
    fetchMomoPaymentState(momo.reference).then(onMomoState, () => undefined);
  }, [momo, onMomoState]);

  // Ask every few seconds while the prompt is on the phone. Paystack's webhook
  // may settle it first; the status check then simply reports `paid`.
  const pollingRef = momo?.state === "approve" ? momo.reference : null;
  useEffect(() => {
    if (!pollingRef) return;
    if (!momoStartedAt.current) momoStartedAt.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - momoStartedAt.current > MOMO_PATIENCE_MS) setMomoSlow(true);
      fetchMomoPaymentState(pollingRef).then(onMomoState, () => undefined);
    }, MOMO_POLL_MS);
    return () => clearInterval(id);
  }, [pollingRef, onMomoState]);

  const openTransaction = useCallback(
    (orderGroupId: string) => {
      if (isMomo && channelId) {
        momoStartedAt.current = 0;
        setMomoSlow(false);
        startMomo.mutate(
          { orderGroupId, channel: channelId, phone: momoPhone, remember: rememberMomo },
          { onSuccess: onMomoState, onError: onError("Could not send the Mobile Money prompt") },
        );
        return;
      }
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
    [channelId, initializePayment, isMomo, momoPhone, onError, onMomoState, rememberMomo, startMomo],
  );

  const payBag = useCallback(() => {
    if (!isSignedIn) {
      router.push(LOGIN_HREF);
      return;
    }
    checkout.mutate({ whatsapp_updates: whatsappUpdates }, {
      onSuccess: (result) => {
        trackMetaEvent(
          "InitiateCheckout",
          { value: result.total_ghs, currency: "GHS", num_items: result.item_count, content_type: "product" },
          `checkout:${result.order_group_id}`,
        );
        openTransaction(result.order_group_id);
      },
      onError: onError("Could not start checkout"),
    });
  }, [checkout, isSignedIn, onError, openTransaction, router, whatsappUpdates]);

  const cardChannel = channels.find((c) => c.paystack_channel === "card") ?? null;

  return {
    channelId,
    setChannelId,
    busy: checkout.isPending || initializePayment.isPending || startMomo.isPending,
    payBag,
    payGroup: openTransaction,
    whatsappUpdates,
    setWhatsappUpdates,
    isMomo,
    showMomoField: isSignedIn && isMomo,
    momoReady: !isMomo || normaliseGhanaPhone(momoPhone) != null,
    busyLabel: isMomo ? "Sending the prompt…" : "Redirecting to Paystack…",
    channelLabel: channel?.label ?? null,
    momoPhone,
    setMomoPhone,
    rememberMomo,
    setRememberMomo,
    momo,
    momoSlow,
    checkMomo,
    submitMomoOtp: (otp: string) => {
      if (momo && momo.state === "otp") {
        submitOtp.mutate({ reference: momo.reference, otp }, { onSuccess: onMomoState, onError: onError("Could not check that code") });
      }
    },
    otpBusy: submitOtp.isPending,
    dismissMomo: () => setMomo(null),
    switchToCard: cardChannel
      ? () => {
          setChannelId(cardChannel.id);
          setMomo(null);
        }
      : null,
  };
}
