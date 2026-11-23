"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { ContactDetails } from "@/features/account/contact-details";
import type { DeliveryAddress } from "@/features/addresses/types";
import { formatGhs } from "@/features/marketing/format";
import type { MomoPrefill } from "@/features/payments/momo";
import { MomoPromptDialog } from "@/features/payments/components/momo-prompt-dialog";
import { PaymentHandoffOverlay } from "@/features/payments/components/payment-handoff-overlay";
import type { PaymentChannel } from "@/features/payments/types";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBagPayment } from "../hooks/useBagPayment";
import { bagKeys, fetchBag } from "../hooks/useAddToBag";
import type { BagView } from "../types";
import { BagContactCard } from "./bag-contact-card";
import { BagDeliverToCard } from "./bag-deliver-to-card";
import { bagPayGate } from "./bag-pay-gate";
import { BagPendingGroupCard } from "./bag-pending-group-card";
import { BagSummaryCard } from "./bag-summary-card";

/** Everything the panel needs that the quote page reads on the server. */
export interface QuoteCheckoutData {
  isSignedIn: boolean;
  zones: DeliveryZoneRow[];
  addresses: DeliveryAddress[];
  paymentChannels: PaymentChannel[];
  paymentHoldNote: string | null;
  pickupEnabled: boolean;
  contact: ContactDetails | null;
  momoPrefill: MomoPrefill | null;
}

export interface QuoteCheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where a signed-out viewer comes back to after signing in (this quote, panel open). */
  returnTo: string;
}

const SHEET_CLASS =
  "max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[24px] bg-tm-paper p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]! md:max-h-none md:rounded-none";

/**
 * Reads what the panel needs only when it first opens (`/api/cart/checkout-context`),
 * then keeps the panel mounted so an open prompt survives the sheet closing.
 */
export function QuoteCheckoutSheet({ open, onOpenChange, returnTo }: QuoteCheckoutSheetProps) {
  const isMobile = useIsMobile();
  const [requested, setRequested] = useState(false);
  if (open && !requested) setRequested(true);
  const { data } = useQuery<QuoteCheckoutData>({
    queryKey: ["checkout-context"],
    queryFn: () => apiFetch<ApiSuccessResponse<QuoteCheckoutData>>("/api/cart/checkout-context").then((r) => r.data),
    enabled: requested,
    staleTime: 60_000,
  });

  if (!data) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={SHEET_CLASS}>
          <SheetHeader className="px-5 pt-5 pb-4">
            <SheetTitle className="font-display text-xl">Pay for your bag</SheetTitle>
            <SheetDescription className="text-[13px]">Loading your bag…</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <Skeleton className="h-16 rounded-[18px]" />
            <Skeleton className="h-40 rounded-[18px]" />
            <Skeleton className="h-64 rounded-[18px]" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return <QuoteCheckoutPanel open={open} onOpenChange={onOpenChange} returnTo={returnTo} data={data} />;
}

/**
 * Quote, bag and Pay on one screen (Seamless Roadmap, Initiative 1).
 *
 * Opens over the quote the moment the line is in the bag: the bag's own
 * details, delivery and pay rail, so a priced quote is one panel away from
 * the MoMo prompt with no page change. It is the bag, not a copy of it: the
 * same query, the same pay gate (`bagPayGate`), the same payment hook. Editing
 * lines stays on /app/bag, one link away.
 */
function QuoteCheckoutPanel({ open, onOpenChange, data, returnTo }: QuoteCheckoutSheetProps & { data: QuoteCheckoutData }) {
  const isMobile = useIsMobile();
  const { data: bag } = useQuery<BagView>({ queryKey: bagKeys.all, queryFn: fetchBag, enabled: open, staleTime: 0 });
  const payment = useBagPayment({
    isSignedIn: data.isSignedIn,
    channels: data.paymentChannels,
    momoPrefill: data.momoPrefill,
    loginNext: returnTo,
  });
  const [contact, setContact] = useState(data.contact);

  const gate = bag
    ? bagPayGate({ bag, isSignedIn: data.isSignedIn, contact, addresses: data.addresses, momoReady: payment.momoReady })
    : { blocked: true, reason: null };
  const payingGhs = payment.lastGroup?.total_ghs ?? bag?.total_ghs ?? null;
  // A declined MoMo prompt leaves the bag checked out (empty) with an unpaid group to retry.
  const retryGroup = bag && bag.lines.length === 0 ? payment.lastGroup : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          data-testid="quote-checkout"
          className={SHEET_CLASS}
        >
          <SheetHeader className="sticky top-0 z-10 border-b border-tm-border bg-card px-5 pt-5 pb-4">
            <SheetTitle className="font-display text-xl">Pay for your bag</SheetTitle>
            <SheetDescription className="text-[13px]">
              {bag ? `${bag.item_count} item${bag.item_count === 1 ? "" : "s"} · travels in one box` : "Loading your bag…"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            {!bag ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16 rounded-[18px]" />
                <Skeleton className="h-40 rounded-[18px]" />
                <Skeleton className="h-64 rounded-[18px]" />
              </div>
            ) : retryGroup ? (
              <BagPendingGroupCard group={retryGroup} paymentChannels={data.paymentChannels} payment={payment} />
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-tm-border rounded-[18px] border border-tm-border bg-card">
                  {bag.lines.map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                      <span className="min-w-0 truncate font-medium">
                        {line.product.title ?? "Item"} <span className="text-tm-text-3">× {line.quantity}</span>
                      </span>
                      <span className="tm-nums shrink-0 font-semibold">
                        {line.pricing ? formatGhs(line.pricing.total_ghs) : "—"}
                      </span>
                    </li>
                  ))}
                  <li className="px-4 py-2.5 text-right">
                    <Link href="/app/bag" className="text-[13px] font-semibold text-tm-coral hover:underline">
                      Edit bag
                    </Link>
                  </li>
                </ul>

                {data.isSignedIn && contact && <BagContactCard contact={contact} onSaved={setContact} />}
                <BagDeliverToCard
                  delivery={bag.delivery}
                  zones={data.zones}
                  addresses={data.addresses}
                  isSignedIn={data.isSignedIn}
                  pickupEnabled={data.pickupEnabled}
                />
                <BagSummaryCard
                  view={bag}
                  now={new Date()}
                  paymentChannels={data.paymentChannels}
                  paymentHoldNote={data.paymentHoldNote}
                  payment={payment}
                  blocked={gate.blocked}
                  blockedReason={gate.reason}
                  payAlways
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PaymentHandoffOverlay kind={payment.handoff} totalGhs={payingGhs} />
      <MomoPromptDialog
        momo={payment.momo}
        totalGhs={payingGhs}
        phone={payment.momoPhone}
        networkLabel={payment.channelLabel}
        slow={payment.momoSlow}
        otpBusy={payment.otpBusy}
        onCheck={payment.checkMomo}
        onSubmitOtp={payment.submitMomoOtp}
        onDismiss={payment.dismissMomo}
        onSwitchToCard={payment.switchToCard}
      />
    </>
  );
}
