"use client";

import { CaretDown } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";

import { fadeIn, SPRING, stagger } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { formatGhs } from "../format";
import type { FinderQuote } from "../types";

interface FinderBreakdownProps {
  quote: FinderQuote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The landed total, line by line. Labels and amounts come from the job as
 * the calculator produced them; this only lays them out.
 */
export function FinderBreakdown({ quote, open, onOpenChange }: FinderBreakdownProps) {
  const panelId = useId();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="-mx-2 flex min-h-11 items-center justify-between gap-2 rounded-xl px-2 text-left text-sm font-semibold text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-4 focus-visible:ring-tm-coral/20"
      >
        {open ? "Hide the breakdown" : "See the breakdown"}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING.snappy} className="text-muted-foreground">
          <CaretDown size={16} weight="bold" aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} key="breakdown" variants={fadeIn} initial="hidden" animate="visible" exit="exit">
            <motion.dl
              variants={stagger(0.03)}
              initial="hidden"
              animate="visible"
              className="mt-1 flex flex-col rounded-2xl bg-muted/60 px-4 py-3"
            >
              {quote.rows.map((row) => (
                <motion.div key={row.key} variants={fadeIn} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
                  <dt className="flex flex-col gap-0.5 py-2 text-[13px]">
                    <span className={cn("font-medium text-foreground", row.key === "customs" && "text-tm-green-ink dark:text-tm-green")}>
                      {row.label}
                    </span>
                    {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
                  </dt>
                  <dd
                    className={cn(
                      "tm-nums py-2 text-right text-[13px] font-semibold",
                      row.key === "customs" && "text-tm-green-ink dark:text-tm-green",
                    )}
                  >
                    {formatGhs(row.amountGhs)}
                  </dd>
                </motion.div>
              ))}
              <motion.div variants={fadeIn} className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-border pt-3">
                <dt className="text-sm font-bold">Landed total</dt>
                <dd className="tm-nums text-right text-sm font-bold">{formatGhs(quote.totalGhs)}</dd>
              </motion.div>
            </motion.dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
