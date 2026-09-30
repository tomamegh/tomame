"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightIcon, GraduationCapIcon, XIcon } from "lucide-react";

import { SECTION_IDS } from "../content";
import { dismissTour, isGuideComplete, readPercent } from "../progress";
import { useGuideProgress, useHydrated } from "../use-guide-progress";

/**
 * "New here? Take the 5-minute tour" on the Overview (081). Shown until the
 * operator has finished the guide on this device or closed the card. Renders
 * nothing on the server and until the browser's copy is read, so a returning
 * operator never sees it flash.
 */
export function GuideTourCard() {
  const hydrated = useHydrated();
  const [progress, update] = useGuideProgress();
  const show = hydrated && !progress.tourDismissed && !isGuideComplete(progress);
  const pct = readPercent(progress, SECTION_IDS);

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.aside
          key="tour"
          aria-label="Operator guide"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[22px] border border-tm-coral/25 bg-[linear-gradient(120deg,#fff1ec_0%,#fdf9f6_60%)] p-4 pr-12 sm:flex-row sm:items-center sm:p-5 sm:pr-14"
        >
          <span className="hidden size-11 shrink-0 items-center sm:flex justify-center rounded-[14px] bg-card text-tm-coral-strong shadow-[0_8px_18px_-12px_rgba(242,91,61,.8)]">
            <GraduationCapIcon className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-display text-[17px] leading-tight font-bold text-tm-ink">
              {pct > 0 ? `Finish the tour: ${pct}% done` : "New here? Take the 5-minute tour"}
            </p>
            <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
              Five minutes for the essentials: the daily flow in real recordings, then a practice bench you cannot break.
            </p>
          </div>
          <Link
            href="/warehouse/guide"
            className="tm-cta-gradient inline-flex h-10 w-fit shrink-0 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
          >
            {pct > 0 ? "Carry on" : "Start the tour"}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => update(dismissTour)}
            aria-label="Hide the tour card"
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-card hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
