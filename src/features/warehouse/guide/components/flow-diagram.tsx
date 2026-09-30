"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, PackageIcon, SmartphoneIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { FLOW } from "../content";
import { GuideVideo } from "./guide-video";

/**
 * The daily flow as a rail you can click along (081 guide). A parcel token
 * travels to the step you choose; the panel underneath says what you do, what
 * the customer sees, the one rule that matters, and plays the real screen.
 *
 * It is a proper tab list: arrow keys, Home and End move between steps.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function FlowDiagram() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const step = FLOW[active]!;

  const go = (next: number, focus = false) => {
    const clamped = Math.max(0, Math.min(FLOW.length - 1, next));
    setDirection(clamped >= active ? 1 : -1);
    setActive(clamped);
    if (focus) tabs.current[clamped]?.focus();
  };

  const onKey = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: FLOW.length - 1 };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    go(next, true);
  };

  const pct = ((active + 0.5) / FLOW.length) * 100;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* The rail */}
      <div className="rounded-[24px] border border-tm-border bg-card px-3 pt-5 pb-4 sm:px-6">
       <div className="relative">
        <div className="pointer-events-none absolute top-[34.5px] right-[8.333%] left-[8.333%] h-[3px] rounded-full bg-tm-hairline sm:top-[36.5px]" aria-hidden>
          <motion.div
            className="h-full origin-left rounded-full bg-[image:var(--tm-gradient-cta)]"
            initial={false}
            animate={{ scaleX: active / (FLOW.length - 1) }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE }}
          />
        </div>

        {/* The parcel riding the rail */}
        <motion.div
          className="pointer-events-none absolute -top-[12px] z-10 -translate-x-1/2"
          initial={false}
          animate={{ left: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 22 }}
          aria-hidden
        >
          <motion.span
            key={active}
            className="flex size-6 items-center justify-center rounded-[7px] bg-[linear-gradient(180deg,#e0ad72,#c48b4d)] text-white shadow-[0_6px_12px_-6px_rgba(110,62,20,.7)]"
            initial={reduce ? false : { y: -6, rotate: -8 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 14 }}
          >
            <PackageIcon className="size-3.5" />
          </motion.span>
        </motion.div>

        <div role="tablist" aria-label="The daily flow, step by step" className="relative grid grid-cols-6" onKeyDown={onKey}>
          {FLOW.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`flow-tab-${s.id}`}
                aria-selected={on}
                aria-controls="flow-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => go(i)}
                className="group flex min-w-0 flex-col items-center gap-2 rounded-[14px] pt-4 pb-1 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full border-2 transition-[background-color,border-color,color,box-shadow] duration-300 sm:size-11",
                    on
                      ? "border-transparent bg-tm-ink text-white shadow-[0_10px_22px_-10px_rgba(43,36,34,.7)]"
                      : done
                        ? "border-tm-coral/40 bg-tm-tint text-tm-coral-strong"
                        : "border-tm-border bg-card text-tm-text-3 group-hover:border-tm-coral/40 group-hover:text-tm-ink",
                    "group-focus-visible:ring-4 group-focus-visible:ring-tm-coral/30",
                  )}
                >
                  <s.icon className="size-[18px]" aria-hidden />
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
                      on ? "bg-[image:var(--tm-gradient-cta)] text-white" : "bg-tm-paper text-tm-text-3",
                    )}
                  >
                    {i + 1}
                  </span>
                </span>
                <span className={cn("hidden truncate text-[12.5px] font-semibold sm:block", on ? "text-tm-ink" : "text-tm-text-2")}>{s.title}</span>
                <span className="sr-only sm:hidden">{s.title}</span>
              </button>
            );
          })}
        </div>
       </div>
      </div>

      {/* The step */}
      <div
        id="flow-panel"
        role="tabpanel"
        aria-labelledby={`flow-tab-${step.id}`}
        className="relative min-w-0 overflow-hidden rounded-[24px] border border-tm-border bg-card"
      >
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
            transition={{ duration: reduce ? 0.12 : 0.35, ease: EASE }}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
          >
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-tm-text-3">
                  Step {active + 1} of {FLOW.length}
                </span>
                <h3 className="font-display text-[24px] leading-none font-bold text-tm-ink">
                  {step.title} <span className="text-tm-coral-strong">· {step.verb}</span>
                </h3>
              </div>

              <ol className="flex flex-col gap-3">
                {step.doing.map((line, i) => (
                  <li key={line} className="flex gap-3 text-[14px] leading-[1.55] font-medium text-tm-ink">
                    <span className="tm-nums mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-tm-paper text-[12px] font-bold text-tm-text-2">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ol>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
                <div className="flex gap-3 rounded-[16px] bg-tm-green-bg p-4">
                  <SmartphoneIcon className="mt-0.5 size-4 shrink-0 text-tm-green-ink" aria-hidden />
                  <p className="text-[13px] leading-[1.5] font-medium text-tm-green-ink">
                    <span className="block font-bold">What the customer sees</span>
                    {step.customer}
                  </p>
                </div>
                <div className="flex gap-3 rounded-[16px] bg-tm-amber-bg p-4">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-tm-amber" aria-hidden />
                  <p className="text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
                    <span className="block font-bold">The rule</span>
                    {step.rule}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => go(active - 1)}
                  disabled={active === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper focus-visible:ring-4 focus-visible:ring-tm-coral/20 focus-visible:outline-none disabled:opacity-40"
                >
                  <ArrowLeftIcon className="size-4" aria-hidden />
                  Back
                </button>
                {active < FLOW.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => go(active + 1)}
                    className="tm-cta-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
                  >
                    Next: {FLOW[active + 1]!.title}
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </button>
                ) : (
                  <a
                    href="#practice"
                    className="tm-cta-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
                  >
                    Try it in practice
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </a>
                )}
                <Link
                  href={step.where.href}
                  className="ml-auto inline-flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
                >
                  Open {step.where.label}
                  <ArrowUpRightIcon className="size-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="min-w-0 xl:pt-1">
              <GuideVideo clip={step.clip} size="sm" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
