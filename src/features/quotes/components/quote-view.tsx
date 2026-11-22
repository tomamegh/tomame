"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { InlineStatus } from "@/components/ui/inline-status";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { Quote } from "@/features/extraction/types";
import type { OriginCountry } from "@/features/orders/types";
import { storeForUrl } from "@/features/extraction/stores";
import { priceContextOf, priceContextParts } from "@/features/extraction/price-context";
import { SimilarProductsRail } from "@/features/catalog/components/similar-products-rail";
import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { useRequestSourcing } from "@/features/sourcing/hooks/useRequestSourcing";
import {
  SourcingContactDialog,
  type SourcingContact,
} from "@/features/sourcing/components/sourcing-contact-dialog";
import { apiFetch, ApiFetchError } from "@/lib/api-client";
import { storeShippingOptionsOf } from "@/features/extraction/store-shipping";
import { toast } from "@/lib/sonner";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import type { QuoteAssurance } from "../types";
import { AssuranceCards } from "./assurance-cards";
import { BuyerNoteCard, ProductColourCard, ProductFacts } from "./product-facts";
import { QuoteActionBar } from "./quote-action-bar";
import { QuoteBreadcrumb } from "./quote-breadcrumb";
import { canContinueToPayment, formatStorePillLabel, needsSourcing } from "./format";
import { QuoteGallery, QuoteThumbRail } from "./quote-gallery";
import { QuoteGapFillers } from "./quote-gap-fillers";
import { QuoteMobileHeader } from "./quote-mobile-header";
import { QuoteReceiptCard } from "./quote-receipt-card";
import { QuoteSkeleton } from "./quote-skeleton";

/** Mirrors `createOrderSchema` in `src/features/orders/schema.ts`. */
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 100;
/**
 * How often the screen asks again while the freight is being checked. A check
 * is a few seconds of model time plus a web search; each poll is one
 * re-price of one line.
 */
const FREIGHT_POLL_MS = 2_500;
/**
 * A4: the quote is re-read while the screen stays open. It used to be fetched
 * once, so a tab opened before an admin pricing change kept showing the old fee
 * for hours (the Ruko quote at 5% after the 4% change, 2026-11-19) — the
 * server prices every read live; only the screen was stale.
 */
const QUOTE_REFRESH_MS = 120_000;
/** While an automatic price re-read runs (103), the screen asks as often as for freight. */
const PRICE_CHECK_POLL_MS = 5_000;
/** Mirrors `addToBagSchema.special_instructions` (src/features/bag/schema.ts), which the bag route enforces. It was 2000 here, so 1001 to 2000 characters were refused with a 400. */
const INSTRUCTIONS_MAX = 1000;

/** What `GET /api/extractions/:id` adds to the `Quote` it returns. */
interface QuoteResponse extends Quote {
  product_url: string;
  is_watching: boolean;
  /** A fresh read of this link is running (a re-paste of a stale read, 106); the figures shown are the old read's. */
  rechecking?: boolean;
}

export interface QuoteViewProps {
  extractionId: string;
  /** The zone the quote assumes, resolved server-side. */
  deliveryZone: DeliveryZoneRow | null;
  /** `site_content` rows of kind `quote_assurance`, resolved server-side. */
  assurances: QuoteAssurance[];
  /**
   * Decides where "back" goes. `/app` is gated by the proxy, so sending a
   * signed-out visitor there from a PUBLIC quote screen bounces them to the
   * login form — which is what happened to Kelvin's tester. They go back to the
   * public paste screen instead; a signed-in customer goes Home.
   */
  isAuthenticated: boolean;
}

/** The quote for this screen's quantity and chosen store shipping service. */
function quoteUrl(extractionId: string, quantity: number, shippingCode: string | null): string {
  const shipping = shippingCode ? `&shipping=${encodeURIComponent(shippingCode)}` : "";
  return `/api/extractions/${extractionId}?quantity=${quantity}${shipping}`;
}

/** Where the review screen's back controls lead, by viewer. */
export function quoteBackHref(isAuthenticated: boolean): string {
  return isAuthenticated ? "/app" : "/app/orders/new";
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
  isAuthenticated,
}: QuoteViewProps) {
  const router = useRouter();
  const backHref = quoteBackHref(isAuthenticated);

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
  // The store shipping service the customer chose; null = the cheapest. A code
  // only: the server resolves it against its own snapshot and prices it.
  const [shippingCode, setShippingCode] = useState<string | null>(null);

  const { mutate: addToBag, isPending: addingToBag } = useAddToBag();
  const { mutate: requestSourcing, isPending: requestingSourcing } = useRequestSourcing();
  // "Who should our buyer call?" sits between the CTA and the request (097).
  // Mounted only once asked for: it reads `/api/app/me` for the prefill, and
  // most quotes never need it.
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMounted, setContactMounted] = useState(false);
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

  // When this screen first saw the freight check running (browser clock), so
  // the notice can say "taking longer" without trusting the device's clock
  // against the server's. Null when no check is running.
  const [freightCheckSeenAt, setFreightCheckSeenAt] = useState<number | null>(null);
  const checkingFreight = quote?.freight_check != null;
  useEffect(() => {
    setFreightCheckSeenAt((seen) => (checkingFreight ? (seen ?? Date.now()) : null));
  }, [checkingFreight]);

  // Silent re-reads while the check runs: no `repricing` flash, and a reply
  // that lands after a quantity or shipping change is dropped by the same
  // monotonic guard the main fetch uses.
  const pollFreight = useCallback(() => {
    const id = requestId.current;
    apiFetch<ApiSuccessResponse<QuoteResponse>>(
      quoteUrl(extractionId, quantity, shippingCode),
    )
      .then((response) => {
        if (id !== requestId.current) return;
        const previous = quoteRef.current;
        quoteRef.current = response.data;
        setQuote(response.data);
        // Say so when the check moved the freight; a silent jump in the total
        // is the thing a customer would rightly distrust.
        // A fresh read of a stale quote landed: say what it changed.
        if (previous?.rechecking && !response.data.rechecking) {
          const was = previous.product.price;
          const is = response.data.product.price;
          if (is == null) toast.error({ title: "No longer available", description: "The store isn't selling this item right now." });
          else if (was != null && is !== was) toast.success({ title: "Price updated", description: "The store's price changed since we last read it." });
        }
        const before = previous?.pricing?.flat_rate_ghs;
        const after = response.data.pricing?.flat_rate_ghs;
        if (previous?.freight_check && !response.data.freight_check && before != null && after != null && before !== after) {
          const weight = response.data.pricing?.weight_lbs;
          toast.success({
            title: "Freight checked",
            description: weight != null ? `Updated for a ${weight} lb shipping weight.` : "The freight has been updated.",
          });
        }
      })
      .catch(() => {
        // The next tick asks again; the CTA stays shut until one answers.
      });
  }, [extractionId, quantity, shippingCode]);
  useVisibleInterval(pollFreight, FREIGHT_POLL_MS, checkingFreight);
  // An automatic price re-read, or a fresh read of a stale quote: both settle within a minute.
  const checkingPrice = (quote?.pay_hold?.kind === "price_check" && !quote.pay_hold.needs_staff) || quote?.rechecking === true;
  useVisibleInterval(pollFreight, PRICE_CHECK_POLL_MS, checkingPrice && !checkingFreight);
  useVisibleInterval(pollFreight, QUOTE_REFRESH_MS, quote != null && !checkingFreight && !checkingPrice);

  const signIn = useCallback(() => {
    const next = `/app/orders/review/${extractionId}`;
    router.push(`/auth/login?next=${encodeURIComponent(next)}`);
  }, [extractionId, router]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setRepricing(true);

    apiFetch<ApiSuccessResponse<QuoteResponse>>(
      quoteUrl(extractionId, quantity, shippingCode),
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
  }, [extractionId, quantity, shippingCode]);

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
        ...(shippingCode ? { store_shipping_code: shippingCode } : {}),
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
    // The gap-fillers' state belongs here too (the derived values are declared
    // below the early returns, so they cannot be listed themselves). Without
    // it a customer who typed a missing price and pressed Add sent the value
    // from an earlier render: the line went into the bag unpriced.
  }, [addToBag, instructions, quantity, quote, router, gapPriceUsd, gapCountry, shippingCode]);

  /**
   * "Ask us to source this" — the CTA an unpriceable item gets instead of a
   * live "Add to bag" over a total nobody has stood behind (065).
   *
   * It still puts the item in the bag; that was never the wrong part. What
   * changes is that the line arrives flagged for a buyer, and the bag refuses
   * to check out while it is there.
   *
   * 401 SENDS THEM TO SIGN IN, exactly as watching a price does. A sourcing
   * request is a promise that somebody will come back to you, so it needs an
   * account to come back to — and the session cookie travels with the request,
   * so the bag they built signed-out is already theirs when they land back.
   */
  const sendSourcingRequest = useCallback((contact: SourcingContact) => {
    if (!quote?.extraction_cache_id) return;
    // Parsed here rather than read from the render-scope `gapPriceValue`: this
    // is a hook, so it is declared above the early returns that guard that
    // value's existence.
    const hintUsd = parsePositiveUsd(gapPriceUsd);
    requestSourcing(
      {
        extraction_cache_id: quote.extraction_cache_id,
        quantity,
        ...contact,
        // Whatever the customer typed into the gap-fillers goes along as a HINT
        // for the buyer. It is stored apart from the price the line is finally
        // charged against, and it can never become that price.
        ...(hintUsd != null ? { estimated_price_usd: hintUsd } : {}),
        ...(gapCountry ? { origin_country: gapCountry } : {}),
      },
      {
        onSuccess: (result) => {
          setContactOpen(false);
          setAddedCount(result.item_count);
          toast.success({
            title: "Sent to our team",
            description:
              "A buyer will price it by hand. We'll let you know as soon as you can pay for it.",
          });
          router.refresh();
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 401) {
            setContactOpen(false);
            signIn();
            return;
          }
          toast.error({
            title: "Could not send that to our team",
            description: error.message,
          });
        },
      },
    );
  }, [quote, quantity, gapPriceUsd, gapCountry, requestSourcing, router, signIn]);

  /**
   * The CTA itself. Signed out goes straight to sign-in: the request needs an
   * account, and a name and number typed before that redirect would be lost to
   * it. Back on this quote, pressing it again opens the dialog prefilled.
   */
  const askToSource = useCallback(() => {
    if (!quote?.extraction_cache_id) return;
    if (!isAuthenticated) {
      signIn();
      return;
    }
    setContactMounted(true);
    setContactOpen(true);
  }, [quote, isAuthenticated, signIn]);

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
  /*
    WE HAVE NOT PROMISED TO BUY THIS (065).

    An unknown store, or one whose shipping region we do not carry, or a product
    the engine cannot price at all. `canContinueToPayment` would happily light
    "Add to bag" the moment the customer picks a country — the calculator has
    everything it needs and a total appears — but a total is not a promise, and
    the screenshot Kelvin sent was exactly that: "Not priced yet · This store
    region is not supported yet", with a live Add to bag underneath and a
    GH₵0.00 pay button waiting at the end of it.

    So the CTA becomes "Ask us to source this", and payment stays shut until a
    buyer has answered. The server re-decides this for itself on the request;
    what is here only chooses which button to draw.
  */
  const sourcingNeeded = needsSourcing({
    platform: quote.platform,
    country: quote.country,
    hasPricing: Boolean(quote.pricing),
    priceMissing,
  });
  const canContinue = canContinueToPayment({
    hasPricing: Boolean(quote.pricing),
    priceMissing,
    countryMissing,
    gapPriceUsd: gapPriceValue,
    gapCountry,
    // The last fetch failed, so what is on screen is the PREVIOUS quantity's
    // price.
    repriceFailed: loadError != null,
  }) && !checkingFreight;

  const gallery = quote.product.images.length
    ? quote.product.images
    : quote.product.image
      ? [quote.product.image]
      : [];
  const hasRail = gallery.length > 1;
  const store = storeForUrl(quote.product_url);
  const payHold = quote.pay_hold ?? null;
  const unavailable = payHold?.kind === "unavailable";
  // The bar's one-line reason while a price or stock check holds payment.
  const holdNote =
    payHold && payHold.kind !== "freight_check" && !unavailable ? `${payHold.message}. You can still add it to your bag.` : null;
  const currencySymbol = quote.product.currency?.toUpperCase() === "GBP" ? "£" : "$";

  return (
    /*
      The phone reserves the height of the fixed action bar (12 + 52 + 16 and
      the hairline, plus a hold line when there is one). Nothing is reserved
      from `lg` up, where the bar does not render.
    */
    <div className={cn("flex flex-col gap-[18px] lg:gap-[22px] lg:pb-0", holdNote ? "pb-[120px]" : "pb-[92px]")}>
      <QuoteMobileHeader
        backHref={backHref}
        storeLabel={formatStorePillLabel(store?.name ?? null, quote.product_url)}
        productUrl={quote.product_url}
        watching={watching}
        watchPending={watchPending}
        onToggleWatch={toggleWatch}
        onShare={share}
      />

      <QuoteBreadcrumb
        backHref={backHref}
        productUrl={quote.product_url}
        fetchedAt={quote.fetched_at}
        now={receivedAt}
      />

      {quote.rechecking && (
        <InlineStatus tone="progress" title="Re-checking price and stock…">
          This link was last read a while ago. We&apos;re reading the store again; the price below updates when it lands.
        </InlineStatus>
      )}

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
            shippingOptions={storeShippingOptionsOf(quote.product)}
            onShippingChange={setShippingCode}
            repricing={repricing}
            freightCheckSeenAt={checkingFreight ? (freightCheckSeenAt ?? receivedAt.getTime()) : null}
            payHold={payHold}
            stockCheck={quote.stock_check ?? null}
            extractionId={quote.extraction_cache_id ?? null}
            priceNotes={priceContextParts(priceContextOf(quote), store?.name ?? null)}
            currencySymbol={currencySymbol}
            onContinue={addLineToBag}
            canContinue={canContinue && !!quote.extraction_cache_id}
            continuePending={addingToBag}
            addedCount={addedCount}
            needsSourcing={sourcingNeeded}
            onAskToSource={askToSource}
            sourcePending={requestingSourcing}
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

      {/*
        Alternatives we have already priced, LAST and lowest in the order: the
        customer came here for the price of their own product, not for a shop.
        It renders nothing at all when the catalogue has no hits for this
        product, so the screen never ends on an empty shelf.
      */}
      <SimilarProductsRail
        title={quote.product.title}
        brand={quote.product.brand}
        productUrl={quote.product_url}
      />

      <QuoteActionBar
        canContinue={canContinue && !!quote.extraction_cache_id}
        continuePending={addingToBag}
        addedCount={addedCount}
        repricing={repricing}
        freightChecking={checkingFreight}
        unavailable={unavailable}
        holdNote={holdNote}
        totalGhs={quote.pricing && quote.pricing.pricing_method !== "needs_review" ? quote.pricing.total_ghs : null}
        onContinue={addLineToBag}
        needsSourcing={sourcingNeeded}
        onAskToSource={askToSource}
        sourcePending={requestingSourcing}
        watching={watching}
        watchPending={watchPending}
        onToggleWatch={toggleWatch}
      />

      {contactMounted && (
        <SourcingContactDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          pending={requestingSourcing}
          onSubmit={sendSourcingRequest}
        />
      )}
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
    <ErrorState
      title="This quote is no longer available"
      description={message}
      className="tm-up mx-auto w-full max-w-[520px]"
      action={
        /* The paste screen itself, not Home: "paste the link again" should land on the paste box. */
        <Button asChild variant="outline" size="touch">
          <Link href="/app/orders/new">
            <ArrowLeft className="size-4" aria-hidden />
            Paste the link again
          </Link>
        </Button>
      }
    />
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
