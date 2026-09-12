"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LinkSimple, WarningCircle } from "@phosphor-icons/react/ssr";

import { QuoteSkeleton } from "@/features/quotes/components";
import { useExtractProduct } from "@/features/extraction/hooks/useExtraction";

/**
 * The step between pasting a link and seeing the landed price.
 *
 * It extracts and forwards — nothing more. Until Phase 3 this screen rendered a
 * second, lesser preview of the product and asked the customer to press
 * "Continue" to see the price they had already asked for; `/app/orders/review`
 * now IS that screen, so the extra hop was a click between the customer and the
 * only number they came for.
 *
 * The skeleton is the quote's own, so the landed price lands in place instead of
 * shoving the page down when it arrives.
 */

// ── Failure ──────────────────────────────────────────────────────────────────

/**
 * Extraction failing is ordinary, not exceptional — a category page instead of a
 * product page, a store that blocks readers, a link truncated by a chat app. The
 * reasons are the ones that actually recur, and the way out is a real link back
 * to the paste bar rather than a dead end.
 */
function ExtractionFailed({ message }: { message: string | null }) {
  return (
    <section className="mx-auto flex max-w-[560px] flex-col items-center gap-5 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-amber-bg">
        <WarningCircle
          weight="duotone"
          className="size-7 text-tm-amber"
          aria-hidden
        />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[22px] leading-[1.2] font-bold">
          We couldn&apos;t read that link
        </h1>
        <p className="text-[14px] leading-[1.5] text-tm-text-2">
          {message ?? "Something went wrong reading the product page."}
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2 rounded-[16px] bg-tm-tint px-5 py-4 text-left text-[13px] leading-[1.5] text-tm-text-2">
        <li>Link straight to one product page, not a search or category page.</li>
        <li>Copy it from your browser&apos;s address bar, not a shared preview.</li>
        <li>Some stores block readers — try the same item on another store.</li>
      </ul>

      <Link
        href="/app"
        className="flex h-11 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-5 text-[14px] leading-none font-semibold transition-colors hover:bg-tm-tint"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Paste another link
      </Link>
    </section>
  );
}

// ── Extract and forward ──────────────────────────────────────────────────────

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: extractProduct } = useExtractProduct();

  // `searchParams.get()` already percent-decodes. Calling decodeURIComponent on
  // top of it throws URIError on any URL containing a bare `%` and silently
  // turns `%2B` into `+`. Do not reintroduce it.
  const url = searchParams.get("url") ?? "";

  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      router.replace("/app");
      return;
    }
    // One paste, one extraction: React 18 StrictMode mounts effects twice in
    // dev and an extraction is a paid vendor call. Keyed by URL, so navigating
    // to this route with a DIFFERENT link still extracts -- an unkeyed ref
    // leaves the second link stuck on the skeleton forever.
    if (started.current === url) return;
    started.current = url;

    extractProduct(
      { product_url: url },
      {
        onSuccess: (quote) => {
          if (quote.extraction_cache_id) {
            // replace(), not push(): the back button should return to the paste
            // bar, not to a screen that immediately re-extracts.
            router.replace(`/app/orders/review/${quote.extraction_cache_id}`);
            return;
          }
          // The extractor answered but nothing was cached, so there is no id to
          // price against. Saying so beats forwarding to a 404.
          setError(
            "We read the page but couldn't save it. Please try that link again.",
          );
        },
        onError: (err) => setError(err.message),
      },
    );
  }, [url, extractProduct, router]);

  if (error) return <ExtractionFailed message={error} />;

  return (
    <div className="flex flex-col gap-[18px] lg:gap-[22px]">
      <p className="flex items-center gap-2 text-[13px] leading-none font-medium text-tm-text-2">
        <LinkSimple className="size-4 shrink-0 text-tm-coral" aria-hidden />
        <span className="truncate">Reading {url}</span>
      </p>
      <QuoteSkeleton />
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<QuoteSkeleton />}>
      <NewOrderContent />
    </Suspense>
  );
}
