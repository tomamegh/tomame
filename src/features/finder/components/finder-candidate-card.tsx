"use client";

import { motion } from "motion/react";

import { NumberRoll } from "@/components/motion/number-roll";
import { slideIn, SPRING } from "@/lib/motion/presets";

import { formatGhs, formatUsd } from "../format";
import type { FinderCandidateState } from "../types";
import { ProductThumb } from "./product-thumb";
import { Shimmer } from "./shimmer";

/** Shared with the result card so a match grows into its result in place. */
export function finderCardLayoutId(id: string): string {
  return `finder-card-${id}`;
}

const STATUS_LINE: Record<FinderCandidateState["status"], string> = {
  found: "Waiting to check",
  checking: "Checking price",
  confirming: "Confirming price",
  priced: "Landed in Accra",
};

/** A match while the run works: what it is, and where its price has got to. */
export function FinderCandidateCard({ candidate }: { candidate: FinderCandidateState }) {
  const { status, quote } = candidate;
  return (
    <motion.article
      layoutId={finderCardLayoutId(candidate.id)}
      variants={slideIn}
      initial="hidden"
      animate="visible"
      transition={SPRING.layout}
      aria-busy={status !== "priced" || undefined}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <ProductThumb src={candidate.imageUrl} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{candidate.title}</h3>
        <p className="truncate text-xs text-muted-foreground">
          {candidate.store.name} · {candidate.condition} · {formatUsd(candidate.listingPriceUsd)} listed
        </p>
      </div>
      <div className="flex w-[6.5rem] shrink-0 flex-col items-end gap-1 text-right">
        {status === "priced" && quote ? (
          <NumberRoll value={formatGhs(quote.totalGhs)} className="text-[15px] font-bold" />
        ) : status === "confirming" ? (
          <span className="inline-flex h-6 items-center rounded-full bg-tm-amber-bg px-2 text-[11px] font-semibold text-warning-foreground dark:bg-tm-amber/15 dark:text-tm-amber">
            Confirming
          </span>
        ) : (
          <Shimmer className="h-5 w-20" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground">{STATUS_LINE[status]}</span>
      </div>
    </motion.article>
  );
}

/** An empty slot the next match lands in, so cards fill in place instead of pushing the page. */
export function FinderCandidateSlot() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
      <Shimmer className="size-16 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Shimmer className="h-3.5 w-11/12" />
        <Shimmer className="h-3.5 w-2/3" />
        <Shimmer className="h-3 w-1/3" />
      </div>
    </div>
  );
}
