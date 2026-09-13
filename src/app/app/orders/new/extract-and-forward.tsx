"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react/ssr";

import { ReadingIndicator } from "@/features/extraction/components/reading-indicator";
import { useCreatePaste } from "@/features/extraction/hooks/usePastes";
import { hostOf } from "@/features/bag/components/format";

/**
 * The step between pasting a link somewhere else and seeing it read.
 *
 * A `?url=` arrives from the Home paste bar, a shared link, or the marketing
 * site. It used to run the OLD synchronous extraction here: one request held
 * open for the chain's whole budget, a skeleton with no sense of time, no 5 s
 * or 20 s copy, no way to add the link to the bag and walk away — every promise
 * the paste queue (049) makes, broken on the most-used entry point. Kelvin's
 * report: "I see no animation that it is being fetched … the timeout experience
 * is not working."
 *
 * Now it does what the paste bar on this screen does: queue the link and go
 * where the queue is. A link the cache already knows is forwarded straight to
 * its price; anything else lands on the Buy-for-me list as `?watch=<id>`, where
 * the row reads with its animation and wait copy and forwards to the price the
 * moment it lands. This screen is therefore on screen for one round trip.
 */

// ── Failure ──────────────────────────────────────────────────────────────────

/**
 * Only the QUEUEING can fail here — a malformed link, a rate limit. Reading
 * failures are the row's to report, on the list, with the describe-it form.
 */
function ExtractionFailed({ message }: { message: string | null }) {
  return (
    <section className="mx-auto flex max-w-[560px] flex-col items-center gap-5 rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-tm-amber-bg">
        <WarningCircle weight="duotone" className="size-7 text-tm-amber" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[22px] leading-[1.2] font-bold">We couldn&apos;t take that link</h1>
        <p className="text-[14px] leading-[1.5] text-tm-text-2">
          {message ?? "Something went wrong queuing the link."}
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2 rounded-[16px] bg-tm-tint px-5 py-4 text-left text-[13px] leading-[1.5] text-tm-text-2">
        <li>Link straight to one product page, not a search or category page.</li>
        <li>Copy it from your browser&apos;s address bar, not a shared preview.</li>
      </ul>

      <Link
        href="/app/orders/new"
        className="flex h-11 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-5 text-[14px] leading-none font-semibold transition-colors hover:bg-tm-tint"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Paste another link
      </Link>
    </section>
  );
}

// ── Queue and forward ────────────────────────────────────────────────────────

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: createPaste } = useCreatePaste();

  // `searchParams.get()` already percent-decodes. Calling decodeURIComponent on
  // top of it throws URIError on any URL containing a bare `%` and silently
  // turns `%2B` into `+`. Do not reintroduce it.
  const url = searchParams.get("url") ?? "";

  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;
    // One paste, one request: React StrictMode mounts effects twice in dev.
    // Keyed by URL so arriving with a DIFFERENT link still queues it.
    if (started.current === url) return;
    started.current = url;

    createPaste(
      { product_url: url },
      {
        onSuccess: (paste) => {
          // replace(), not push(): the back button should return to wherever
          // the link was pasted, not to a screen that re-queues it.
          if (paste.outcome === "priced" && paste.extraction_cache_id) {
            router.replace(`/app/orders/review/${paste.extraction_cache_id}`);
            return;
          }
          router.replace(`/app/orders/new?watch=${encodeURIComponent(paste.id)}`);
        },
        onError: (err) => setError(err.message),
      },
    );
  }, [url, createPaste, router]);

  if (error) return <ExtractionFailed message={error} />;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-[24px] border border-tm-border bg-card px-[22px] py-6">
      <ReadingIndicator host={hostOf(url)} title="Reading this page…" detail={null} elapsedSeconds={null} />
    </div>
  );
}

/**
 * The `?url=` path: queue that one link and go to where it reads.
 *
 * The screen WITHOUT a `?url=` is `PasteQueueView`, which is where the queue
 * lives; see `page.tsx`.
 */
export function ExtractAndForward() {
  return (
    <Suspense fallback={null}>
      <NewOrderContent />
    </Suspense>
  );
}
