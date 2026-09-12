"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react/ssr";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { Quote } from "@/features/extraction/types";
import { storeForUrl } from "@/features/extraction/stores";
import { useCreateOrder } from "@/features/orders/hooks/useCreateOrder";
import { apiFetch, ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import type { QuoteAssurance } from "../types";
import { AssuranceCards } from "./assurance-cards";
import { BuyerNoteCard, ProductColourCard, ProductFacts } from "./product-facts";
import { QuoteActionBar } from "./quote-action-bar";
import { QuoteBreadcrumb } from "./quote-breadcrumb";
import { formatStorePillLabel } from "./format";
import { QuoteGallery, QuoteThumbRail } from "./quote-gallery";
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

  const { mutate: createOrder, isPending: creatingOrder } = useCreateOrder();

  // Monotonic guard: a slow quantity=1 response must never overwrite a fast
  // quantity=3 one. `AbortController` alone does not cover a response that is
  // already in flight when the next request starts.
  const requestId = useRef(0);

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
        setQuote(response.data);
        setReceivedAt(new Date());
        setWatching(response.data.is_watching);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "We could not load this quote.",
        );
      })
      .finally(() => {
        if (id === requestId.current) setRepricing(false);
      });

    return () => controller.abort();
  }, [extractionId, quantity]);

  const toggleWatch = useCallback(() => {
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

  const continueToPayment = useCallback(() => {
    if (!quote || !quote.pricing) return;

    // Identity and intent only. Price, currency, weight, region and the whole
    // breakdown are decided server-side from the stored snapshot.
    createOrder(
      {
        product_url: quote.product_url,
        product_name: quote.product.title ?? "Product from link",
        ...(isHttpUrl(quote.product.image)
          ? { product_image_url: quote.product.image }
          : {}),
        quantity,
        ...(instructions.trim() ? { special_instructions: instructions.trim() } : {}),
        ...(quote.extraction_cache_id
          ? { extraction_cache_id: quote.extraction_cache_id }
          : {}),
      },
      {
        onSuccess: (order) => {
          // A line the engine could not price outright goes to the order page
          // for our review; anything fully priced goes straight to Paystack.
          router.push(
            order.needs_review
              ? `/app/orders/${order.id}`
              : `/app/orders/${order.id}/checkout`,
          );
        },
        onError: (error) => {
          // Quoting is public; placing the order needs an account.
          if (error instanceof ApiFetchError && error.status === 401) {
            signIn();
            return;
          }
          toast.error({
            title: "Could not create your order",
            description: error.message,
          });
        },
      },
    );
  }, [createOrder, instructions, quantity, quote, router, signIn]);

  if (loadError && !quote) return <QuoteLoadError message={loadError} />;
  if (!quote || !receivedAt) return <QuoteSkeleton />;

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
            onContinue={continueToPayment}
            continuePending={creatingOrder}
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
          <ProductColourCard product={quote.product} />
          <BuyerNoteCard
            value={instructions}
            onChange={setInstructions}
            maxLength={INSTRUCTIONS_MAX}
          />
        </div>
      </div>

      <QuoteActionBar
        canContinue={Boolean(quote.pricing)}
        continuePending={creatingOrder}
        repricing={repricing}
        onContinue={continueToPayment}
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

function isHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
