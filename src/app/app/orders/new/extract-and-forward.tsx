"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { ReadingIndicator } from "@/features/extraction/components/reading-indicator";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { hostOf } from "@/features/bag/components/format";

/**
 * The step between pasting a link somewhere else and seeing it read.
 *
 * A `?url=` arrives from a shared link, a catalogue card or the marketing
 * site. Since 108 the links open a chat on Buy for me, where each is read and
 * priced in the thread; one link the cache already priced opens its quote
 * straight away. This screen is on screen for a round trip.
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
      try {
        // The links open a chat (108): each is read and priced in the thread.
        const res = await apiFetch<ApiSuccessResponse<{ chatId: string; readyQuotes: { extractionCacheId: string }[] }>>("/api/finder/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: links.join(" ") }),
        });
        const { chatId, readyQuotes } = res.data;
        // replace(), not push(): back should return to where the link was pasted.
        // One link we already priced opens its quote, as a catalogue card promises.
        if (links.length === 1 && readyQuotes.length === 1) {
          router.replace(`/app/orders/review/${readyQuotes[0]!.extractionCacheId}`);
          return;
        }
        router.replace(`/app/find/chat/${chatId}`);
      } catch (err) {
        setFailure({ message: err instanceof Error ? err.message : null });
      }
    })();
  }, [key, router]);

  if (failure) return <ExtractionFailed message={failure.message} />;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-[24px] border border-border bg-card px-[22px] py-6">
      <ReadingIndicator
        host={urls.length > 1 ? `${urls.length} links` : hostOf(urls[0] ?? "")}
        title={urls.length > 1 ? "Adding your links" : "Reading this page"}
        detail={null}
        elapsedSeconds={null}
        stage={urls.length > 1 ? undefined : "queued"}
      />
    </div>
  );
}

/** The `?url=` path. The screen without one is the Buy for me chat; see `page.tsx`. */
export function ExtractAndForward() {
  return (
    <Suspense fallback={null}>
      <NewOrderContent />
    </Suspense>
  );
}
