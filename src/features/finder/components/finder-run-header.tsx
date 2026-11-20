"use client";

import { CheckCircle, Sparkle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef } from "react";

import { fadeIn } from "@/lib/motion/presets";

import { formatClock, formatDuration } from "../format";
import type { FinderPhase } from "../types";

/** Past this, the screen says so instead of letting "about a minute" quietly go stale. */
const SLOW_AFTER_MS = 90_000;

interface FinderRunHeaderProps {
  phase: Exclude<FinderPhase, "asking">;
  query: string;
  elapsedMs: number;
}

/** The request, and how long the run has taken. The h1 takes focus when a run starts. */
export const FinderRunHeader = forwardRef<HTMLHeadingElement, FinderRunHeaderProps>(function FinderRunHeader(
  { phase, query, elapsedMs },
  ref,
) {
  return (
    <header className="flex flex-col gap-3">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-tint px-3 py-1 text-xs font-semibold text-tm-coral-strong dark:bg-tm-coral/15 dark:text-tm-coral">
        <Sparkle size={14} weight="fill" aria-hidden />
        Price finder
      </span>
      <h1
        ref={ref}
        tabIndex={-1}
        className="line-clamp-2 text-[26px] font-extrabold leading-[1.1] outline-none @md:text-[34px]"
      >
        {query}
      </h1>
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "working" ? (
            <motion.span
              key="working"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold"
            >
              <span className="relative inline-flex size-2" aria-hidden>
                <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-coral" />
                <span className="absolute inset-0 rounded-full bg-tm-coral" />
              </span>
              Working
              <span className="tm-nums font-medium text-muted-foreground">
                <span className="sr-only">for </span>
                {formatClock(elapsedMs)}
              </span>
            </motion.span>
          ) : (
            <motion.span
              key="finished"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              className={
                phase === "result"
                  ? "inline-flex h-8 items-center gap-1.5 rounded-full bg-tm-green-bg px-3 text-[13px] font-semibold text-tm-green-ink dark:bg-tm-green/15 dark:text-tm-green"
                  : "inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] font-semibold text-muted-foreground"
              }
            >
              {phase === "result" && <CheckCircle size={16} weight="fill" aria-hidden />}
              {phase === "result" ? "Done" : "Searched"} in {formatDuration(elapsedMs)}
            </motion.span>
          )}
        </AnimatePresence>
        {phase === "working" && (
          <span className="text-[13px] text-muted-foreground">
            {elapsedMs > SLOW_AFTER_MS
              ? "Taking longer than usual. We are still on it and will email you."
              : "This usually takes about a minute."}
          </span>
        )}
      </div>
    </header>
  );
});
