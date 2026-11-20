"use client";

import { ArrowSquareOut, Check, HourglassMedium, Package, Tote } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { NumberRoll } from "@/components/motion/number-roll";
import { Button } from "@/components/ui/button";
import { fadeIn, popIn, PRESS, riseIn, SPRING } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { formatGhs, formatUsd } from "../format";
import type { FinderCandidateState } from "../types";
import { finderCardLayoutId } from "./finder-candidate-card";
import { FinderBreakdown } from "./finder-breakdown";
import { ProductThumb } from "./product-thumb";
import { Shimmer } from "./shimmer";

interface FinderResultCardProps {
  candidate: FinderCandidateState;
  /** The best landed price: larger, highlighted, breakdown open by default. */
  featured?: boolean;
  /** Hands the pick to the normal quote flow. Resolves once it is in the bag. */
  onAddToBag?: (candidate: FinderCandidateState) => Promise<void> | void;
}

const pill = "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold";

export function FinderResultCard({ candidate, featured = false, onAddToBag }: FinderResultCardProps) {
  const titleId = useId();
  const noticeId = useId();
  const [open, setOpen] = useState(featured);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const { quote } = candidate;
  const confirming = candidate.status !== "priced" || quote == null;

  async function add() {
    if (confirming || added || adding) return;
    setAdding(true);
    try {
      await onAddToBag?.(candidate);
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <motion.article
      layoutId={finderCardLayoutId(candidate.id)}
      transition={SPRING.layout}
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-4 rounded-3xl border bg-card p-4 @md:p-5",
        featured
          ? "border-tm-coral/40 shadow-[0_18px_40px_-24px_rgba(242,91,61,0.45)]"
          : "border-border",
      )}
    >
      <motion.div layout="position" className="flex gap-4">
        <ProductThumb src={candidate.imageUrl} size={featured ? "lg" : "md"} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {confirming ? (
              <motion.span
                key="confirming"
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(pill, "w-fit gap-1 bg-tm-amber-bg text-warning-foreground dark:bg-tm-amber/15 dark:text-tm-amber")}
              >
                <HourglassMedium size={13} weight="fill" aria-hidden />
                Confirming price
              </motion.span>
            ) : featured ? (
              <motion.span
                key="best"
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(pill, "w-fit bg-tm-tint text-tm-coral-strong dark:bg-tm-coral/15 dark:text-tm-coral")}
              >
                Best price
              </motion.span>
            ) : null}
          </AnimatePresence>
          <h3
            id={titleId}
            className={cn("line-clamp-2 font-semibold leading-snug", featured ? "text-base @md:text-lg" : "text-[15px]")}
          >
            {candidate.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(pill, "border border-border text-foreground")}>{candidate.store.name}</span>
            <span className={cn(pill, "bg-tm-green-bg text-tm-green-ink dark:bg-tm-green/15 dark:text-tm-green")}>
              {candidate.condition}
            </span>
            {candidate.seller && (
              <span className="truncate text-xs text-muted-foreground">Sold by {candidate.seller}</span>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div layout="position" className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {featured ? "Best price, landed in Accra" : "Landed in Accra"}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {quote && !confirming ? (
            <motion.div key="total" variants={fadeIn} initial="hidden" animate="visible" className="flex flex-col gap-0.5">
              <NumberRoll
                value={formatGhs(quote.totalGhs)}
                className={cn("font-display font-extrabold leading-tight", featured ? "text-[34px] @md:text-[40px]" : "text-[26px]")}
              />
              <span className="text-[13px] text-muted-foreground">
                About {formatUsd(quote.totalUsd)}. Nothing more to pay on delivery.
              </span>
            </motion.div>
          ) : (
            <motion.div key="pending" variants={fadeIn} initial="hidden" animate="visible" exit="exit" className="flex flex-col gap-1.5">
              <Shimmer className={featured ? "h-10 w-48" : "h-8 w-40"} />
              <span className="text-[13px] text-muted-foreground">The total appears here once the store confirms it.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence initial={false}>
        {confirming && (
          <motion.p
            key="confirming-note"
            id={noticeId}
            role="status"
            variants={riseIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-start gap-2 rounded-xl bg-tm-amber-bg px-3 py-2.5 text-[13px] leading-snug text-warning-foreground dark:bg-tm-amber/15 dark:text-tm-amber"
          >
            <HourglassMedium size={16} weight="duotone" className="mt-px shrink-0" aria-hidden />
            We are confirming this price with the store. You can add it to your bag as soon as it is confirmed.
          </motion.p>
        )}
      </AnimatePresence>

      {candidate.stockCheck && (
        <motion.p
          layout="position"
          className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-[13px] leading-snug text-foreground"
        >
          <Package size={16} weight="duotone" className="mt-px shrink-0 text-muted-foreground" aria-hidden />
          We confirm stock before you pay.
        </motion.p>
      )}

      {candidate.why && (
        <motion.p layout="position" className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{featured ? "Why this one: " : "How it compares: "}</span>
          {candidate.why}
        </motion.p>
      )}

      {quote && !confirming && (
        <motion.div layout="position">
          <FinderBreakdown quote={quote} open={open} onOpenChange={setOpen} />
        </motion.div>
      )}

      <motion.div layout="position" className="flex flex-col gap-2 @md:flex-row">
        <motion.div whileTap={confirming || added ? undefined : PRESS} className="flex @md:flex-1">
          <Button
            type="button"
            variant="primary"
            onClick={add}
            disabled={confirming || adding}
            aria-busy={adding || undefined}
            aria-describedby={confirming ? noticeId : undefined}
            className={cn(
              "h-11 w-full rounded-xl text-[15px]",
              added && "from-tm-green to-tm-green shadow-none hover:translate-y-0",
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {added ? (
                <motion.span key="added" variants={popIn} initial="hidden" animate="visible" className="inline-flex items-center gap-2">
                  <Check weight="bold" aria-hidden />
                  Added to bag
                </motion.span>
              ) : (
                <motion.span key="add" variants={fadeIn} initial="hidden" animate="visible" exit="exit" className="inline-flex items-center gap-2">
                  <Tote weight="bold" aria-hidden />
                  Add to bag
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-xl text-[15px] dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted"
        >
          <a href={candidate.productUrl} target="_blank" rel="noopener noreferrer">
            See on {candidate.store.name}
            <ArrowSquareOut weight="bold" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      </motion.div>
    </motion.article>
  );
}

