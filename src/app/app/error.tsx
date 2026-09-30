"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/report-client-error";
import Link from "next/link";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react/ssr";

/**
 * Segment error UI for every `/app` screen without its own. Rendered inside
 * the app layout, so the customer keeps the nav and can go elsewhere.
 *
 * The digest is shown, not the message: the message can carry database
 * detail, and the digest is what correlates with the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app screen failed", error);
    reportClientError({ kind: "render", message: error.message || "Screen failed", digest: error.digest });
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
          Something went wrong on our side
        </h1>
        <p className="max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Nothing you paid for or pasted has been lost. Try again, and if it keeps
          happening tell support and quote the reference below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-tm-coral px-5 text-sm leading-none font-semibold text-white transition-colors hover:bg-tm-coral-strong outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40"
        >
          <ArrowClockwise weight="bold" className="size-4" aria-hidden />
          Try again
        </button>
        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-[13px] border border-tm-border bg-card px-5 text-sm leading-none font-semibold transition-colors hover:border-tm-coral/40 hover:text-tm-coral-strong outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40"
        >
          Back to Home
        </Link>
      </div>

      {error.digest && (
        <p className="tm-nums text-[11px] leading-none font-medium text-tm-text-3">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
