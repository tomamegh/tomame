"use client";

import { useEffect } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react/ssr";

/**
 * Route-level error UI.
 *
 * `listWatches` is deliberately loud: a missing table rethrows rather than
 * degrading to an empty list (see `isSchemaMissingError`), because a deploy
 * that ran before its migration should produce a visible failure and not a
 * screen that quietly claims the customer is watching nothing. This is what
 * that failure looks like.
 *
 * The digest is surfaced, not the message: the message can carry database
 * detail, and the digest is what correlates with the server log.
 */
export default function WatchesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("price-watch page failed", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-[24px] border border-tm-border bg-card p-8"
    >
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral">
        <WarningCircle weight="duotone" className="size-[22px]" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[22px] leading-none font-bold">
          We couldn&rsquo;t load your price watches
        </h1>
        <p className="max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Nothing has been lost — your watches are still being re-checked. Try
          again, and if it keeps happening tell support and quote the reference
          below.
        </p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center gap-2 rounded-[13px] border border-tm-border bg-card px-5 text-sm leading-none font-semibold transition-colors hover:border-tm-coral/40 hover:text-tm-coral-strong outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40"
      >
        <ArrowClockwise weight="bold" className="size-4" aria-hidden />
        Try again
      </button>

      {error.digest && (
        <p className="tm-nums text-[11px] leading-none font-medium text-tm-text-3">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
