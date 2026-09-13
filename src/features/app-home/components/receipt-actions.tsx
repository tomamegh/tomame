"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise, ChatCircleText, Tote } from "@phosphor-icons/react/ssr";

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
 */
export function ReceiptActions({ productUrl, extractionCacheId, unpriced }: ReceiptActionsProps) {
  const router = useRouter();
  const [describing, setDescribing] = useState(false);
  const createPaste = useCreatePaste();

  const onRetry = useCallback(() => {
    createPaste.mutate(
      { product_url: productUrl },
      {
        onSuccess: (paste) => {
          if (paste.status === "ready" && paste.extraction_cache_id) {
            router.push(`/app/orders/review/${paste.extraction_cache_id}`);
            return;
          }
          // Queued, not finished. The Buy-for-me screen is where it can be
          // watched, so send them somewhere that shows progress rather than
          // leaving them on a card that looks unchanged.
          toast.success({ title: "Reading it again", description: "We'll show the price as soon as we have it." });
          router.push("/app/orders/new");
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
        {!unpriced && extractionCacheId ? (
          <Link
            href={`/app/orders/review/${extractionCacheId}`}
            className="tm-cta-gradient inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] leading-none font-bold text-white transition-[filter] hover:brightness-105"
          >
            <Tote weight="bold" className="size-3.5" aria-hidden />
            Add to bag
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
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
      />
    </>
  );
}
