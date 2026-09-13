"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react/ssr";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { Quote } from "@/features/extraction/types";
import type { OriginCountry } from "@/features/orders/types";
import { storeForUrl } from "@/features/extraction/stores";
import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { apiFetch, ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import type { QuoteAssurance } from "../types";
import { AssuranceCards } from "./assurance-cards";
import { BuyerNoteCard, ProductColourCard, ProductFacts } from "./product-facts";
import { QuoteActionBar } from "./quote-action-bar";
import { QuoteBreadcrumb } from "./quote-breadcrumb";
import { canContinueToPayment, formatStorePillLabel } from "./format";
import { QuoteGallery, QuoteThumbRail } from "./quote-gallery";
import { QuoteGapFillers } from "./quote-gap-fillers";
import { QuoteMobileHeader } from "./quote-mobile-header";
import { QuoteReceiptCard } from "./quote-receipt-card";
import { QuoteSkeleton } from "./quote-skeleton";

/** Mirrors `createOrderSchema` in `src/features/orders/schema.ts`. */
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 100;
const INSTRUCTIONS_MAX = 2000;

/** What `GET /api/extractions/:id` adds to the `Quote` it returns. */
interface QuoteResponse extends Quote {
  product_url: string;
  is_watching: boolean;
}

export interface QuoteViewProps {
  extractionId: string;
  /** The zone the quote assumes, resolved server-side. */
  deliveryZone: DeliveryZoneRow | null;
  /** `site_content` rows of kind `quote_assurance`, resolved server-side. */
  assurances: QuoteAssurance[];
}

/**
 * The landed-price screen.
 *
 * It fetches the quote from the CLIENT on purpose. `GET /api/extractions/:id`
 * mints or reuses the viewer's rate lock and sets the anonymous quote-session
 * cookie through `finalize()`; a server component cannot set that cookie during
 * a render, so an anonymous visitor would get a fresh lock on every request and
 * the price they were shown could move under them. Quantity changes re-fetch,
 * because both the item subtotal and the freight scale with it and only the
 * server may decide by how much.
 *
 * Nothing here calculates money. Every figure is rendered from the
 * `PricingBreakdown` the server returned.
 */
export function QuoteView({
  extractionId,
  deliveryZone,
  assurances,
}: QuoteViewProps) {
  const router = useRouter();

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  // Captured when the quote lands rather than read at render time, so the
  // "Read 2 min ago" clause and the lock deadline cannot disagree with each
  // other or change on an unrelated re-render.
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repricing, setRepricing] = useState(false);

  const [quantity, setQuantity] = useState(QUANTITY_MIN);
  const [instructions, setInstructions] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);

  const [watching, setWatching] = useState(false);
  const [watchPending, setWatchPending] = useState(false);

  // What the customer supplies when the extractor could not. Both are only
  // reachable when the corresponding field is genuinely missing, and the server
  // honours them only then.
  const [gapPriceUsd, setGapPriceUsd] = useState("");
  const [gapCountry, setGapCountry] = useState<OriginCountry | null>(null);

  const { mutate: addToBag, isPending: addingToBag } = useAddToBag();
  // Count in the bag after this screen added the line, so the CTA can hand off
  // to the bag instead of adding the same product a second time by accident.
  const [addedCount, setAddedCount] = useState<number | null>(null);

  // Monotonic guard: a slow quantity=1 response must never overwrite a fast
  // quantity=3 one. `AbortController` alone does not cover a response that is
  // already in flight when the next request starts.
  const requestId = useRef(0);
  // Read inside the fetch callbacks, which must not re-run when the quote
  // changes; a ref keeps the effect's dependency list honest.
  const quoteRef = useRef<QuoteResponse | null>(null);

  const signIn = useCallback(() => {
    const next = `/app/orders/review/${extractionId}`;
    router.push(`/auth/login?next=${encodeURIComponent(next)}`);
  }, [extractionId, router]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setRepricing(true);

    apiFetch<ApiSuccessResponse<QuoteResponse>>(
      `/api/extractions/${extractionId}?quantity=${quantity}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (id !== requestId.current) return;
        quoteRef.current = response.data;
        setQuote(response.data);
        setReceivedAt(new Date());
        setWatching(response.data.is_watching);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "We could not load this quote.";
        setLoadError(message);
        // A failed RE-price is the dangerous case: the previous quantity's
        // total is still on screen beside the new quantity in the stepper, and
        // silently leaving it there would let someone consent to one number and
        // be charged for another. Say so, and let `repriceFailed` below disable
        // the CTA until a fetch succeeds.
        if (quoteRef.current) {
          toast.error({
            title: "Could not update the price",
            description: message,
          });
        }
      })
      .finally(() => {
        if (id === requestId.current) setRepricing(false);
      });

    return () => controller.abort();
  }, [extractionId, quantity]);

  const toggleWatch = useCallback(() => {
    // There is no unwatch endpoint yet, so this adds only. The buttons are
    // disabled once `watching` is true rather than left live and inert.
    if (!quote || watching) return;
    setWatchPending(true);
    apiFetch(`/api/watches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: quote.product_url }),
    })
      .then(() => {
        setWatching(true);
        toast.success({
          title: "Watching this price",
          description: "We will tell you when it moves.",
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiFetchError && error.status === 401) {
          signIn();
          return;
        }
        toast.error({
          title: "Could not start watching",
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      })
      .finally(() => setWatchPending(false));
  }, [quote, signIn, watching]);

  const share = useCallback(() => {
    if (typeof window === "undefined") return;
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() =>
        toast.success({
          title: "Link copied",
          description: "Send this quote to whoever is paying.",
        }),
      )
      .catch(() =>
        toast.error({
          title: "Could not copy the link",
          description: "Copy it from the address bar instead.",
        }),
      );
  }, []);

  const addLineToBag = useCallback(() => {
    if (!quote || !quote.extraction_cache_id) return;

    // Identity and intent only. Price, currency, weight, region and the whole
    // breakdown are decided server-side from the stored snapshot; the two
    // gap-fillers are honoured only where the extraction left that gap.
    addToBag(
      {
        extraction_cache_id: quote.extraction_cache_id,
        quantity,
        ...(instructions.trim() ? { special_instructions: instructions.trim() } : {}),
        ...(priceMissing && gapPriceValue != null ? { estimated_price_usd: gapPriceValue } : {}),
        ...(countryMissing && gapCountry ? { origin_country: gapCountry } : {}),
      },
      {
        onSuccess: (result) => {
          setAddedCount(result.item_count);
          toast.success({
            title: result.created ? "Added to your bag" : "Quantity updated in your bag",
            description: "Items bought the same week travel together in one box.",
          });
          // The nav badge is server-rendered; refresh the layout so it reads the new count.
          router.refresh();
        },
        onError: (error) => {
          toast.error({
            title: "Could not add to your bag",
            description: error.message,
          });
        },
      },
    );
  }, [addToBag, instructions, quantity, quote, router]);

  if (loadError && !quote) return <QuoteLoadError message={loadError} />;
  if (!quote || !receivedAt) return <QuoteSkeleton />;

  // A gap is only a gap when the SERVER could not fill it. `pricing` is null
  // for several reasons; only the missing-price one is something the customer
  // can answer, and `country` is the extraction's own verdict on the store.
  const priceMissing =
    !quote.pricing &&
    (quote.product.price == null || !(quote.product.price > 0));
  const countryMissing = !quote.country;
  const gapPriceValue = parsePositiveUsd(gapPriceUsd);
  const canContinue = canContinueToPayment({
    hasPricing: Boolean(quote.pricing),
    priceMissing,
    countryMissing,
    gapPriceUsd: gapPriceValue,
    gapCountry,
    // The last fetch failed, so what is on screen is the PREVIOUS quantity's
    // price.
    repriceFailed: loadError != null,
  });

  const gallery = quote.product.images.length
    ? quote.product.images
    : quote.product.image
      ? [quote.product.image]
      : [];
  const hasRail = gallery.length > 1;
  const store = storeForUrl(quote.product_url);

  return (
    /*
      `pb-[95px]` is the height of the action bar, which is `fixed` and so out
      of flow: 12 + 52 + 30 plus its hairline, the literal the artboard gives.
      `main` already carries the page's own 64px bottom padding, so the gap the
      customer sees under the last card stays the usual one — the bar covers
      the space reserved here. Nothing is reserved from `lg` up, where the bar
      does not render.
    */
    <div className="flex flex-col gap-[18px] pb-[95px] lg:gap-[22px] lg:pb-0">
      <QuoteMobileHeader
        storeLabel={formatStorePillLabel(store?.name ?? null, quote.product_url)}
        productUrl={quote.product_url}
        watching={watching}
        watchPending={watchPending}
        onToggleWatch={toggleWatch}
        onShare={share}
      />

      <QuoteBreadcrumb
        productUrl={quote.product_url}
        fetchedAt={quote.fetched_at}
        now={receivedAt}
      />

      {/*
        One grid at every width. Below `lg` it collapses to a single column and
        `order` puts the receipt directly under the chips, where the 390px
        artboard has it — the colour and buyer-note cards follow the price
        rather than pushing it below the fold.
      */}
      <div
        className={cn(
          "grid items-start gap-3.5 lg:gap-x-[22px] lg:gap-y-5",
          // The 72px rail column only exists when there is a rail to put in it;
          // an empty track would leave a 72px hole beside a one-image listing.
          hasRail
            ? "lg:grid-cols-[72px_1fr_420px]"
            : "lg:grid-cols-[1fr_420px]",
        )}
      >
        {hasRail && (
          <div className="hidden lg:order-1 lg:block">
            <QuoteThumbRail
              images={gallery}
              selectedIndex={selectedImage}
              onSelect={setSelectedImage}
            />
          </div>
        )}

        <div className="tm-up order-1 flex min-w-0 flex-col gap-3.5 lg:order-2 lg:gap-5 [animation-delay:0.1s] [animation-duration:0.5s]">
          <QuoteGallery
            images={gallery}
            title={quote.product.title ?? ""}
            storeName={store?.name ?? null}
            productUrl={quote.product_url}
            selectedIndex={selectedImage}
            onSelect={setSelectedImage}
            watching={watching}
            watchPending={watchPending}
            onToggleWatch={toggleWatch}
            onShare={share}
          />

          <ProductFacts
            product={quote.product}
            productUrl={quote.product_url}
            messages={quote.messages}
          />
        </div>

        <div className="tm-up order-2 flex flex-col gap-3.5 lg:order-3 lg:row-span-2 lg:sticky lg:top-5 [animation-delay:0.15s] [animation-duration:0.5s]">
          <QuoteReceiptCard
            pricing={quote.pricing}
            unavailableReason={quote.pricing_unavailable_reason}
            deliveryZone={deliveryZone}
            now={receivedAt}
            quantity={quantity}
            minQuantity={QUANTITY_MIN}
            maxQuantity={QUANTITY_MAX}
            onQuantityChange={setQuantity}
            repricing={repricing}
            onContinue={addLineToBag}
            canContinue={canContinue && !!quote.extraction_cache_id}
            continuePending={addingToBag}
            addedCount={addedCount}
            watching={watching}
            watchPending={watchPending}
            onToggleWatch={toggleWatch}
          />

          <AssuranceCards assurances={assurances} pricing={quote.pricing} />
        </div>

        <div
          className={cn(
            "tm-up order-3 grid gap-3.5 sm:grid-cols-2 lg:order-4 lg:row-start-2 lg:gap-4 [animation-delay:0.1s] [animation-duration:0.5s]",
            hasRail ? "lg:col-start-2" : "lg:col-start-1",
          )}
        >
          <QuoteGapFillers
            priceMissing={priceMissing}
            countryMissing={countryMissing}
            priceUsd={gapPriceUsd}
            onPriceChange={setGapPriceUsd}
            country={gapCountry}
            onCountryChange={setGapCountry}
          />
          <ProductColourCard product={quote.product} />
          <BuyerNoteCard
            value={instructions}
            onChange={setInstructions}
            maxLength={INSTRUCTIONS_MAX}
          />
        </div>
      </div>

      <QuoteActionBar
        canContinue={canContinue && !!quote.extraction_cache_id}
        continuePending={addingToBag}
        addedCount={addedCount}
        repricing={repricing}
        onContinue={addLineToBag}
        watching={watching}
        watchPending={watchPending}
        onToggleWatch={toggleWatch}
      />
    </div>
  );
}

/**
 * The 404 an expired or unknown extraction produces. Quotes are cached for a
 * limited window, so this is a routine state, not a crash — it offers the one
 * action that works, which is pasting the link again.
 */
function QuoteLoadError({ message }: { message: string }) {
  return (
    <section className="tm-up mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-amber-bg">
        <WarningCircle
          weight="duotone"
          className="size-7 text-tm-amber"
          aria-hidden
        />
      </span>
      <h1 className="font-display text-[20px] leading-[1.2] font-bold">
        This quote is no longer available
      </h1>
      <p className="text-sm leading-[1.5] font-medium text-tm-text-2">
        {message}
      </p>
      <Link
        href="/app"
        className="inline-flex items-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-4 py-3 text-sm leading-none font-semibold transition-colors hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Paste the link again
      </Link>
    </section>
  );
}


/**
 * The gap-filler price as a number, or null when it is not a usable one.
 * Mirrors `createOrderSchema`: positive and at most 50,000.
 */
function parsePositiveUsd(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || value > 50_000) return null;
  return value;
}
