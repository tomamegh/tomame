"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise, ChatCircleText, CheckCircle, Path, Tote } from "@phosphor-icons/react/ssr";

import type { ReceiptFulfilment } from "@/db/queries/receipt-state";

import { AssistedRequestDialog } from "@/features/assisted/components";
import { useCreatePaste } from "@/features/extraction/hooks/usePastes";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

export interface ReceiptActionsProps {
  productUrl: string;
  /** Present only when the link was read and priced — then the action is "go and buy it". */
  extractionCacheId: string | null;
  /** True when the card is showing a reason instead of a price. */
  unpriced: boolean;
  /** True when this customer has already described the link to a buyer and that request is still open. */
  assistedOpen: boolean;
  /** What has already become of this product — nothing, in the bag, or ordered. */
  fulfilment: ReceiptFulfilment;
}

const SECONDARY = cn(
  "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card",
  "px-3 text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/**
 * What the customer can DO about the last link they pasted.
 *
 * The card used to end at "Price could not be read from the product page." and
 * nothing else — a dead end reporting a failure the customer had no way to act
 * on. It also had no action when the price WAS read, because the bag did not
 * exist when it was written; it does now.
 *
 * So: a priced receipt offers the price and the bag. An unpriced one offers the
 * two things that actually help — read it again (stores block readers
 * intermittently, and a second attempt often works), or stop waiting on the
 * machine and describe it to a person.
 *
 * ONCE A PERSON HAS IT, THE MACHINE'S OPTIONS GO. An open assisted request
 * means a buyer is already sourcing this link by hand; offering "Try again" and
 * "Describe it" beside that invites a second, duplicate request and a re-read
 * nobody is waiting on. The card says who has it instead.
 */
export function ReceiptActions({
  productUrl,
  extractionCacheId,
  unpriced,
  assistedOpen,
  fulfilment,
}: ReceiptActionsProps) {
  const router = useRouter();
  const [describing, setDescribing] = useState(false);
  const createPaste = useCreatePaste();

  const onRetry = useCallback(() => {
    createPaste.mutate(
      { product_url: productUrl },
      {
        onSuccess: (paste) => {
          // `outcome`, not `status`: a `ready` job whose page yielded no price
          // has nowhere to go, and forwarding it lands on an unpriced quote.
          if (paste.outcome === "priced" && paste.extraction_cache_id) {
            router.push(`/app/orders/review/${paste.extraction_cache_id}`);
            return;
          }
          // Queued, not finished. The Buy-for-me screen is where it can be
          // watched — the row reads there with its own animation and wait copy,
          // and forwards to the price the moment it lands.
          toast.success({ title: "Reading it again", description: "We'll show the price as soon as we have it." });
          router.push(`/app/orders/new?watch=${encodeURIComponent(paste.id)}`);
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 429) {
            toast.error({ title: "Steady on", description: "Give it a few minutes before trying that link again." });
            return;
          }
          toast.error({ title: "Could not read that link", description: error.message });
        },
      },
    );
  }, [createPaste, productUrl, router]);

  return (
    <>
      <div className="flex items-center gap-2">
        {/*
          ORDERED WINS OVER EVERYTHING. The card used to offer "Add to bag" for a
          product the customer had already paid for, because it only knew a link
          had been pasted. A bought item's next step is to follow the parcel;
          an unpaid order's is to finish paying.
        */}
        {fulfilment.kind === "ordered" ? (
          fulfilment.paid ? (
            <Link
              href={`/app/orders/${fulfilment.orderId}`}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card px-3 text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint"
            >
              <Path weight="bold" className="size-3.5 text-tm-green" aria-hidden />
              Track this journey
              <ArrowRight weight="bold" className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <Link
              href="/app/bag"
              className="tm-cta-gradient inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] leading-none font-bold text-white transition-[filter] hover:brightness-105"
            >
              Finish paying
              <ArrowRight weight="bold" className="size-3.5" aria-hidden />
            </Link>
          )
        ) : fulfilment.kind === "in_bag" ? (
          // Already a line in the open bag. Pressing "Add to bag" again would
          // only bump its quantity, which is never what someone means when they
          // are looking at the receipt for a thing they have just added.
          <Link
            href="/app/bag"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card px-3 text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint"
          >
            <Tote weight="bold" className="size-3.5 text-tm-coral" aria-hidden />
            {fulfilment.quantity > 1 ? `In your bag · ${fulfilment.quantity}` : "In your bag"}
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        ) : !unpriced && extractionCacheId ? (
          <Link
            href={`/app/orders/review/${extractionCacheId}`}
            className="tm-cta-gradient inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] leading-none font-bold text-white transition-[filter] hover:brightness-105"
          >
            <Tote weight="bold" className="size-3.5" aria-hidden />
            Add to bag
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        ) : assistedOpen ? (
          <p className="flex flex-1 items-center gap-2 rounded-xl bg-tm-green-bg px-3.5 py-3 text-[13px] leading-[1.4] font-semibold text-tm-green-ink">
            <CheckCircle weight="fill" className="size-4 shrink-0 text-tm-green" aria-hidden />
            A buyer is on it. We&rsquo;ll message you on WhatsApp.
          </p>
        ) : (
          <>
            <button type="button" onClick={onRetry} disabled={createPaste.isPending} className={SECONDARY}>
              <ArrowsClockwise weight="bold" className="size-3.5" aria-hidden />
              {createPaste.isPending ? "Reading…" : "Try again"}
            </button>
            <button type="button" onClick={() => setDescribing(true)} className={SECONDARY}>
              <ChatCircleText weight="bold" className="size-3.5" aria-hidden />
              Describe it
            </button>
          </>
        )}
      </div>

      <AssistedRequestDialog
        open={describing}
        onOpenChange={setDescribing}
        productUrl={productUrl}
        displayUrl={productUrl}
        // This card is server-rendered; the closure above only takes effect
        // once the page re-reads the row, so ask for that as the dialog closes.
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}
