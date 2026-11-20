"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { readBatch, writeBatch } from "@/features/extraction/components/batch-storage";
import { ReadingIndicator } from "@/features/extraction/components/reading-indicator";
import { useCreatePaste } from "@/features/extraction/hooks/usePastes";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import type { PasteStatus } from "@/features/extraction/services/paste-status";
import { hostOf } from "@/features/bag/components/format";

/**
 * The step between pasting a link somewhere else and seeing it read.
 *
 * A `?url=` arrives from the Home paste box, a shared link, or the marketing
 * site. It queues the link (049) and goes where the queue is: a link the cache
 * already knows is forwarded straight to its price; anything else lands on Buy
 * for me as `?watch=<id>`, where its row reads and forwards to the price when
 * it lands. Several `?url=` (Home's box takes many links at once, plan 2b)
 * are queued one after another and land on Buy for me as one batch. This
 * screen is on screen for a round trip or two.
 */

/** Only the QUEUEING can fail here (a malformed link, a rate limit); reading failures are the row's. */
function ExtractionFailed({ message }: { message: string | null }) {
  return (
    <ErrorState
      title="We couldn't take that link"
      description={
        <>
          {message ?? "Something went wrong adding the link."} Use a link to one product page, copied from your browser&apos;s address bar.
        </>
      }
      className="mx-auto w-full max-w-[560px]"
      action={
        <Button asChild variant="outline" size="touch">
          <Link href="/app/orders/new">
            <ArrowLeft className="size-4" aria-hidden />
            Paste another link
          </Link>
        </Button>
      }
    />
  );
}

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync: createPaste } = useCreatePaste();

  // `searchParams` already percent-decodes. Calling decodeURIComponent on top
  // throws URIError on a bare `%` and turns `%2B` into `+`. Do not reintroduce it.
  const urls = searchParams.getAll("url").filter(Boolean).slice(0, PASTE_BATCH_MAX);
  const key = urls.join("\n");

  // Null while working; set (message possibly null) once queueing has failed.
  const [failure, setFailure] = useState<{ message: string | null } | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!key) return;
    // One run per set of links: StrictMode mounts effects twice in dev.
    if (started.current === key) return;
    started.current = key;
    const links = key.split("\n");

    void (async () => {
      const queued: PasteStatus[] = [];
      for (const link of links) {
        try {
          queued.push(await createPaste({ product_url: link }));
        } catch (err) {
          // The first failure on a single link is the answer; in a batch the rest still go.
          if (links.length === 1) {
            setFailure({ message: err instanceof Error ? err.message : null });
            return;
          }
        }
      }
      if (queued.length === 0) {
        setFailure({ message: "None of those links could be added." });
        return;
      }
      // replace(), not push(): back should return to where the link was pasted.
      if (queued.length === 1 && links.length === 1) {
        const only = queued[0]!;
        if (only.outcome === "priced" && only.extraction_cache_id) {
          router.replace(`/app/orders/review/${only.extraction_cache_id}`);
          return;
        }
        router.replace(`/app/orders/new?watch=${encodeURIComponent(only.id)}`);
        return;
      }
      const ids = queued.map((p) => p.id);
      writeBatch([...readBatch().filter((id) => !ids.includes(id)), ...ids].slice(-PASTE_BATCH_MAX));
      router.replace("/app/orders/new");
    })();
  }, [key, createPaste, router]);

  if (failure) return <ExtractionFailed message={failure.message} />;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-[24px] border border-border bg-card px-[22px] py-6">
      <ReadingIndicator
        host={urls.length > 1 ? `${urls.length} links` : hostOf(urls[0] ?? "")}
        title={urls.length > 1 ? "Adding your links" : "Reading this page"}
        detail={null}
        elapsedSeconds={null}
      />
    </div>
  );
}

/** The `?url=` path. The screen without one is `PasteQueueView`; see `page.tsx`. */
export function ExtractAndForward() {
  return (
    <Suspense fallback={null}>
      <NewOrderContent />
    </Suspense>
  );
}
