"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowDownIcon, CheckCircle2Icon, ClockIcon, GamepadIcon, PlayCircleIcon } from "lucide-react";

import { PackageBox } from "@/features/warehouse/components/package-box";
import type { PackageStatus } from "@/features/warehouse/types";
import { cn } from "@/lib/utils";

import { SECTION_IDS, TOTAL_MINUTES } from "../content";
import { isGuideComplete, readPercent } from "../progress";
import { useGuideProgress, useHydrated } from "../use-guide-progress";

/**
 * The guide's opening (081): what this is, how long it takes, and — for a
 * returning operator — where they got to. The box on the right lives the
 * whole day in a loop: open on the bench, taped, stamped.
 */

const CYCLE: PackageStatus[] = ["packing", "sealed", "shipped"];

export function GuideHero() {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const [progress] = useGuideProgress();
  const [i, setI] = useState(0);
  const pct = hydrated ? readPercent(progress, SECTION_IDS) : 0;
  const complete = hydrated && isGuideComplete(progress);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % CYCLE.length), 2600);
    return () => window.clearInterval(t);
  }, [reduce]);

  const status = CYCLE[i]!;

  return (
    <header className="tm-up relative overflow-hidden rounded-[30px] border border-tm-border bg-card [animation-duration:0.5s]">
      <div className="pointer-events-none absolute -top-24 -right-24 size-[360px] rounded-full bg-[radial-gradient(closest-side,#ffe4d9,transparent)]" aria-hidden />
      <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-8 p-5 sm:p-9 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-5">
          <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">Operator guide · US hub</span>
          <h1 className="font-display text-[30px] leading-[1.04] font-bold tracking-[-0.035em] text-tm-ink sm:text-[44px]">
            Everything you need for your first shift.
          </h1>
          <p className="max-w-[58ch] text-[15px] leading-[1.6] font-medium text-tm-text-2">
            How parcels move through the hub, what every screen and button does, how to print a label that scans, and how to undo the
            things that can be undone. Real screen recordings, a practice bench you cannot break, and a quick check at the end.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#first-day"
              className="tm-cta-gradient inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(244,63,94,0.7)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
            >
              {pct > 0 && !complete ? "Carry on reading" : "Start the tour"}
              <ArrowDownIcon className="size-4" aria-hidden />
            </a>
            <a
              href="#practice"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-tm-border bg-card px-5 text-[14px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper focus-visible:ring-4 focus-visible:ring-tm-coral/20 focus-visible:outline-none"
            >
              <GamepadIcon className="size-4" aria-hidden />
              Jump to practice
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-semibold text-tm-text-3">
            <li className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-4" aria-hidden />
              5 minutes for the essentials, {TOTAL_MINUTES} for everything
            </li>
            <li className="inline-flex items-center gap-1.5">
              <PlayCircleIcon className="size-4" aria-hidden />8 short recordings
            </li>
            <li className={cn("inline-flex items-center gap-1.5", complete && "text-tm-green-ink")}>
              <CheckCircle2Icon className="size-4" aria-hidden />
              {complete ? "Completed on this device" : hydrated && pct > 0 ? `${pct}% read on this device` : "Progress saved on this device"}
            </li>
          </ul>
        </div>

        <div className="relative mx-auto hidden h-[240px] w-[250px] items-end md:flex justify-center rounded-[26px] bg-[radial-gradient(110%_100%_at_50%_0%,#ffe4d9_0%,#fff1ec_40%,#fdf9f6_80%)] pb-6" aria-hidden>
          <PackageBox status={status} reference="PKG-10042" size={168} />
          <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-card px-3 py-1 text-[12px] font-semibold text-tm-text-2 shadow-[0_4px_12px_-6px_rgba(43,36,34,.3)]">
            {status === "packing" ? "Open on the bench" : status === "sealed" ? "Sealed, labelled" : "Shipped"}
          </span>
        </div>
      </div>
    </header>
  );
}
