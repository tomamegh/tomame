"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, Clock, UserCircle } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PasteReceiptRow } from "../services/paste-batch";
import { checkedOn, quoteExpiry, readingClock } from "./batch-format";

/** A clock that re-renders every `ms`, for the countdowns below. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Item, tax, fee, store shipping, freight incl. customs and the rate: the quote page's rows, in the chat. */
export function QuoteReceipt({ rows, className }: { rows: readonly PasteReceiptRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <dl className={cn("flex flex-col gap-1.5 text-[13px] leading-[1.35]", className)}>
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
          <dd className="tm-nums shrink-0 text-right font-semibold text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Free quote — pay within 24 hours or this quote will be cancelled", with the exact time and what is left. */
export function QuoteExpiryLine({ expiresAt, className }: { expiresAt: string | null; className?: string }) {
  const now = useNow(30_000);
  const expiry = quoteExpiry(expiresAt, now);
  if (!expiry || expiry.lapsed) return null;
  return (
    <p className={cn("flex gap-1.5 text-[12.5px] leading-[1.45] font-medium text-muted-foreground", className)}>
      <Clock weight="bold" className="mt-[2px] size-3.5 shrink-0" aria-hidden />
      <span>
        Free quote. Pay within 24 hours or this quote will be cancelled. Ends{" "}
        <span className="tm-nums font-semibold text-foreground">{expiry.at}</span> ·{" "}
        <span className="tm-nums">{expiry.left}</span>
      </span>
    </p>
  );
}

/** The live read failed and the catalogue's last check priced it: say so, with the date. */
export function CachedPriceNote({ checkedAt, className }: { checkedAt: string | null; className?: string }) {
  const day = checkedOn(checkedAt);
  if (!day) return null;
  return (
    <p className={cn("text-[12.5px] leading-[1.45] font-medium text-tm-amber", className)}>
      Last checked price, from {day}. The store didn&apos;t answer just now; we confirm the price before we buy.
    </p>
  );
}

/** A paste no reader could price: a buyer has it, and the answer comes back here. */
export function ManualQuoteNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex gap-1.5 text-[13px] leading-[1.45] font-medium text-foreground", className)}>
      <UserCircle weight="bold" className="mt-[2px] size-4 shrink-0 text-tm-coral" aria-hidden />
      <span>
        We couldn&apos;t price this one automatically. A buyer is quoting it by hand and will reply in this chat
        within a few hours. Keep the chat; nothing is charged until you pay.
      </span>
    </p>
  );
}

/** Seconds since the paste was queued, and from a minute on, what happens if it never prices. */
export function ReadingClock({ queuedAt, className }: { queuedAt: string; className?: string }) {
  const now = useNow(1_000);
  const clock = readingClock(queuedAt, now);
  return (
    <p className={cn("flex flex-col gap-0.5 text-[12px] leading-[1.4] font-medium text-muted-foreground", className)}>
      <span className="tm-nums">Reading for {clock.elapsed}</span>
      {clock.note && <span>{clock.note}</span>}
    </p>
  );
}

/** "Re-check price" inside the 24 hours, "Get a fresh quote" after them. */
export function RefreshQuoteButton({ expired, loading, onClick, className }: { expired: boolean; loading: boolean; onClick: () => void; className?: string }) {
  return (
    <Button variant="outline" size="touch" className={className} onClick={onClick} loading={loading}>
      {!loading && <ArrowClockwise weight="bold" className="size-4" aria-hidden />}
      {expired ? "Get a fresh quote" : "Re-check price"}
    </Button>
  );
}

/** What an expired or stale quote says above its button. */
export function RefreshNote({ expired, className }: { expired: boolean; className?: string }) {
  return (
    <p className={cn("text-[12.5px] leading-[1.45] font-medium text-muted-foreground", className)}>
      {expired
        ? "This free quote passed its 24 hours unpaid and was cancelled. A fresh quote uses today's price and rate."
        : "The price needs a fresh check before you pay. Your quote's 24 hours still run."}
    </p>
  );
}
