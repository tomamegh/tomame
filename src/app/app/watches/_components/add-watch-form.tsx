"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { LinkSimple, SpinnerGap } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { useCreateWatch } from "@/features/watches/hooks/useWatches";
import { watchDisplayName } from "@/features/watches/components/format";

type Status = { tone: "success" | "info"; text: string };

export interface AddWatchFormProps {
  className?: string;
}

/**
 * The page's only interactive island: paste a link, start watching it.
 *
 * It sends the URL and nothing else. The product name, the USD price, the GH₵
 * total and the rate are all resolved server-side by `createWatch` from the
 * same extraction chain and the same pricing engine the quote flow uses — there
 * is deliberately no code path that would let this form seed a baseline price.
 *
 * The call is idempotent, so `created: false` is a normal answer and not a
 * failure: the customer already watches that link and we have just refreshed
 * its price. Saying "Now watching" there would claim a row that was not
 * created, so the two outcomes get different copy.
 *
 * The list itself is server-rendered, so a successful mutation ends in
 * `router.refresh()` rather than client-side cache surgery — the page re-reads
 * through `listWatches` and every figure stays server-derived.
 */
export function AddWatchForm({ className }: AddWatchFormProps) {
  const router = useRouter();
  const createWatch = useCreateWatch();
  const [isRefreshing, startRefresh] = useTransition();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status | null>(null);

  const isEmpty = url.trim().length === 0;
  const isBusy = createWatch.isPending || isRefreshing;
  // The server's own message — "we couldn't read that product page", "that
  // store isn't supported yet" — is more useful than anything generic here.
  const errorMessage = createWatch.error?.message ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isBusy) return;

    setStatus(null);
    createWatch.mutate(
      { url: trimmed },
      {
        onSuccess: (result) => {
          setUrl("");
          const name = watchDisplayName(result.watch);
          setStatus(
            result.created
              ? { tone: "success", text: `Now watching ${name}.` }
              : {
                  tone: "info",
                  text: `You were already watching ${name}, so we've just re-checked its price.`,
                },
          );
          startRefresh(() => router.refresh());
        },
      },
    );
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <form
        onSubmit={handleSubmit}
        aria-busy={isBusy}
        className={cn(
          "flex flex-col gap-2 rounded-[18px] border-[1.5px] border-tm-border bg-card p-1.5",
          "focus-within:border-tm-coral/50",
          "sm:h-[62px] sm:flex-row sm:items-center sm:gap-0 sm:pl-[18px]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center px-3 py-2 sm:px-0 sm:py-0">
          <LinkSimple
            weight="duotone"
            className="size-[22px] shrink-0 text-tm-coral"
            aria-hidden
          />
          <div className="min-w-0 flex-1 px-3.5">
            <label htmlFor="watch-product-url" className="sr-only">
              Product link to watch
            </label>
            <input
              id="watch-product-url"
              name="url"
              // `text`, not `url`: a mistyped link should reach the server and
              // come back with our own message rather than a native bubble.
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a product link to watch"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={isBusy}
              className="w-full min-w-0 bg-transparent text-base leading-none text-tm-ink outline-none placeholder:text-tm-text-3 disabled:opacity-60"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isEmpty || isBusy}
          className={cn(
            "tm-cta-gradient inline-flex h-[50px] shrink-0 items-center justify-center gap-2 rounded-[13px] px-[22px]",
            "text-[15px] leading-none font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
            "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            "disabled:pointer-events-none disabled:opacity-55",
          )}
        >
          {isBusy && (
            <SpinnerGap
              weight="bold"
              className="size-4 animate-spin"
              aria-hidden
            />
          )}
          {createWatch.isPending ? "Checking the store" : "Watch price"}
        </button>
      </form>

      {/*
        One live region for both outcomes, so a screen reader hears the result
        of the submission it just made rather than a silent page.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-[18px] px-1.5 text-[13px] leading-[1.4] font-medium",
          errorMessage
            ? "text-tm-coral-strong"
            : status?.tone === "success"
              ? "text-tm-green-ink"
              : "text-tm-text-2",
        )}
      >
        {errorMessage ??
          status?.text ??
          (createWatch.isPending
            ? "Reading the product page and pricing it. This takes a few seconds."
            : "We check the price once a day and keep the last 30 days.")}
      </p>
    </div>
  );
}
