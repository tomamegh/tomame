"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SpinnerGap, Trash } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { useDeleteWatch } from "@/features/watches/hooks/useWatches";

export interface RemoveWatchButtonProps {
  watchId: string;
  /** Used for the accessible name, so the control is not one of nine "Remove"s. */
  productName: string;
  className?: string;
}

/**
 * Stop watching one product.
 *
 * No confirmation dialog: the action removes a price series the customer can
 * recreate by pasting the link again, and a modal on every row would cost more
 * than the mistake does.
 *
 * Deliberately the smallest possible island — the row around it is a Server
 * Component, and this button's only job is the mutation plus the
 * `router.refresh()` that makes the server re-read the list.
 */
export function RemoveWatchButton({
  watchId,
  productName,
  className,
}: RemoveWatchButtonProps) {
  const router = useRouter();
  const deleteWatch = useDeleteWatch();
  const [isRefreshing, startRefresh] = useTransition();

  // The row stays on screen until the refreshed server render replaces it, so
  // the pending state has to cover the refresh as well as the request.
  const isBusy = deleteWatch.isPending || isRefreshing;

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        disabled={isBusy}
        onClick={() =>
          deleteWatch.mutate(
            { id: watchId },
            { onSuccess: () => startRefresh(() => router.refresh()) },
          )
        }
        aria-label={`Stop watching ${productName}`}
        aria-busy={isBusy}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-[11px]",
          "border border-tm-border bg-card text-tm-text-3 transition-colors",
          "hover:border-tm-coral/40 hover:text-tm-coral-strong",
          "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40",
          "disabled:pointer-events-none disabled:opacity-55",
        )}
      >
        {isBusy ? (
          <SpinnerGap weight="bold" className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash className="size-4" aria-hidden />
        )}
      </button>

      {deleteWatch.error && (
        <span
          role="status"
          className="max-w-[20ch] text-right text-[11px] leading-[1.3] font-medium text-tm-coral-strong"
        >
          {deleteWatch.error.message}
        </span>
      )}
    </div>
  );
}
