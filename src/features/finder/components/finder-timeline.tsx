"use client";

import { CaretDown, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { fadeIn, popIn, riseIn, SPRING, stagger } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { formatBudget } from "../format";
import type { FinderSpec, FinderStepState, FinderStepStatus, FinderStoreProgress } from "../types";
import { Shimmer } from "./shimmer";

interface FinderTimelineProps {
  steps: FinderStepState[];
  spec: FinderSpec | null;
  stores: FinderStoreProgress[];
  /** After the run: fold the steps behind a "How we found this" button. */
  collapsible?: boolean;
}

export function FinderTimeline({ steps, spec, stores, collapsible = false }: FinderTimelineProps) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const done = steps.filter((s) => s.status === "done").length;
  const listings = stores.reduce((sum, s) => sum + (s.listings ?? 0), 0);

  const list = (
    <motion.ol variants={stagger(0.04)} initial="hidden" animate="visible" className="flex flex-col">
      {steps.map((step, i) => (
        <TimelineStep key={step.key} step={step} last={i === steps.length - 1} spec={spec} stores={stores} />
      ))}
    </motion.ol>
  );

  if (!collapsible) {
    return (
      <section aria-labelledby={headingId} className="rounded-3xl border border-border bg-card p-4 @md:p-5">
        <h2 id={headingId} className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          What we are doing
        </h2>
        {list}
      </section>
    );
  }

  return (
    <motion.section layout="position" transition={SPRING.layout} className="rounded-3xl border border-border bg-card">
      <h2 id={headingId}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center gap-3 rounded-3xl px-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-tm-coral/20 @md:px-5"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tm-green text-white">
            <Check size={14} weight="bold" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold">How we found this</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {done} steps · {listings} listings from {stores.length} {stores.length === 1 ? "store" : "stores"}
            </span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING.snappy} className="text-muted-foreground">
            <CaretDown size={18} weight="bold" aria-hidden />
          </motion.span>
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="px-4 pb-5 @md:px-5"
          >
            {list}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function TimelineStep({
  step,
  last,
  spec,
  stores,
}: {
  step: FinderStepState;
  last: boolean;
  spec: FinderSpec | null;
  stores: FinderStoreProgress[];
}) {
  const active = step.status === "active";
  return (
    <motion.li
      layout="position"
      transition={SPRING.layout}
      variants={riseIn}
      aria-current={active ? "step" : undefined}
      className={cn("relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3", !last && "pb-5")}
    >
      {!last && (
        <>
          <span aria-hidden className="absolute bottom-0 left-[13.5px] top-8 w-px bg-border" />
          <motion.span
            aria-hidden
            className="absolute bottom-0 left-[13.5px] top-8 w-px origin-top bg-tm-green"
            initial={false}
            animate={{ scaleY: step.status === "done" ? 1 : 0 }}
            transition={SPRING.smooth}
          />
        </>
      )}
      <StepMarker status={step.status} />
      <div className="flex min-w-0 flex-col gap-2 pt-0.5">
        <div className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={step.label}
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn(
                "text-[15px] leading-snug",
                step.status === "pending" && "text-muted-foreground/70",
                active && "font-semibold text-foreground",
                step.status === "done" && "text-foreground",
              )}
            >
              <span className="sr-only">{STATUS_TEXT[step.status]}: </span>
              {step.label}
            </motion.p>
          </AnimatePresence>
          {active && (
            <span aria-hidden className="absolute -bottom-1.5 left-0 h-0.5 w-20 overflow-hidden rounded-full bg-tm-coral/15">
              <span className="tm-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-tm-coral" />
            </span>
          )}
        </div>
        {/* Detail rows hold their height from the start, so nothing below jumps when they fill. */}
        {step.key === "understand" && (
          <div className="min-h-9">
            <SpecChips spec={spec} waiting={step.status !== "pending"} />
          </div>
        )}
        {step.key === "search" && (
          <div className="min-h-9">
            <StorePills stores={stores} />
          </div>
        )}
        {step.key === "shortlist" && (
          <div className="min-h-9">
            {step.details.length > 0 && (
              <motion.p variants={fadeIn} initial="hidden" animate="visible" className="text-[13px] leading-snug text-muted-foreground">
                Set aside: {step.details.join(" · ")}
              </motion.p>
            )}
          </div>
        )}
      </div>
    </motion.li>
  );
}

const STATUS_TEXT: Record<FinderStepStatus, string> = {
  pending: "Next",
  active: "Now",
  done: "Done",
};

function StepMarker({ status }: { status: FinderStepStatus }) {
  return (
    <span aria-hidden className="relative z-10 flex size-7 items-center justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        {status === "done" ? (
          <motion.span
            key="done"
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex size-7 items-center justify-center rounded-full bg-tm-green text-white"
          >
            <Check size={14} weight="bold" />
          </motion.span>
        ) : status === "active" ? (
          <motion.span
            key="active"
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex size-7 items-center justify-center rounded-full border-2 border-tm-coral bg-card"
          >
            <span className="relative inline-flex size-2">
              <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-coral" />
              <span className="absolute inset-0 rounded-full bg-tm-coral" />
            </span>
          </motion.span>
        ) : (
          <motion.span
            key="pending"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="size-7 rounded-full border-2 border-border bg-card"
          />
        )}
      </AnimatePresence>
    </span>
  );
}

const chipBase = "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold";

/** The request as the job understood it. Shimmers while it is being read. */
function SpecChips({ spec, waiting }: { spec: FinderSpec | null; waiting: boolean }) {
  if (!spec) {
    if (!waiting) return null;
    return (
      <div className="flex h-8 gap-2" aria-hidden>
        <Shimmer className="h-8 w-28 rounded-full" />
        <Shimmer className="h-8 w-20 rounded-full" />
        <Shimmer className="h-8 w-24 rounded-full" />
      </div>
    );
  }
  const chips: Array<{ text: string; tone: "ink" | "plain" | "green" }> = [
    { text: spec.product, tone: "ink" },
    ...spec.mustHaves.map((m) => ({ text: m, tone: "plain" as const })),
    ...(spec.budgetGhs != null ? [{ text: formatBudget(spec.budgetGhs), tone: "plain" as const }] : []),
    ...(spec.newOnly ? [{ text: "New only", tone: "green" as const }] : []),
  ];
  return (
    <motion.ul
      variants={stagger(0.03)}
      initial="hidden"
      animate="visible"
      aria-label="What we are looking for"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
    >
      {chips.map((chip) => (
        <motion.li
          key={chip.text}
          variants={popIn}
          className={cn(
            chipBase,
            chip.tone === "ink" && "bg-foreground text-background",
            chip.tone === "plain" && "border border-border bg-background text-foreground",
            chip.tone === "green" && "bg-tm-green-bg text-tm-green-ink dark:bg-tm-green/15 dark:text-tm-green",
          )}
        >
          {chip.text}
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** The stores being searched, lighting up while they are searched. */
function StorePills({ stores }: { stores: FinderStoreProgress[] }) {
  if (stores.length === 0) return null;
  return (
    <motion.ul
      variants={stagger(0.04)}
      initial="hidden"
      animate="visible"
      aria-label="Stores"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
    >
      {stores.map(({ store, status, listings }) => {
        const searching = status === "searching";
        const found = status === "done" && (listings ?? 0) > 0;
        return (
          <motion.li
            key={store.id}
            variants={popIn}
            className={cn(chipBase, "relative gap-1.5 overflow-hidden border border-border bg-background")}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 bg-tm-tint dark:bg-tm-coral/15"
              initial={false}
              animate={{ opacity: searching ? 1 : 0 }}
              transition={{ duration: 0.2 }}
            />
            <span className={cn("relative", searching ? "text-tm-coral-strong dark:text-tm-coral" : "text-foreground")}>
              {store.name}
            </span>
            <span className="relative inline-flex min-w-4 justify-center">
              {searching ? (
                <span className="relative inline-flex size-1.5" aria-hidden>
                  <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-coral" />
                  <span className="absolute inset-0 rounded-full bg-tm-coral" />
                </span>
              ) : (
                <motion.span
                  key="count"
                  variants={popIn}
                  initial="hidden"
                  animate="visible"
                  aria-hidden
                  className={cn(
                    "tm-nums text-[12px]",
                    found ? "text-tm-green-ink dark:text-tm-green" : "font-medium text-muted-foreground",
                  )}
                >
                  {found ? listings : "none"}
                </motion.span>
              )}
              <span className="sr-only">
                {searching ? ": searching" : found ? `: ${listings} listings` : ": no listings"}
              </span>
            </span>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
