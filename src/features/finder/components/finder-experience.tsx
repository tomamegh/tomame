"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";

import { riseIn, SPRING } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { buyerWhatsappHref, formatGhs } from "../format";
import { selectRankedCandidates } from "../state/reducer";
import type { FinderCandidateState, FinderState } from "../types";
import { FinderAsk, type FinderRequest } from "./finder-ask";
import { FinderCandidateCard, FinderCandidateSlot } from "./finder-candidate-card";
import { FinderLeaveAnytime } from "./finder-leave-anytime";
import { FinderNothingFound } from "./finder-nothing-found";
import { FinderResultCard } from "./finder-result-card";
import { FinderRunHeader } from "./finder-run-header";
import { FinderTimeline } from "./finder-timeline";

/** The pipeline prices its top three; the working screen holds a slot for each. */
const MATCH_SLOTS = 3;

export interface FinderExperienceProps {
  state: FinderState;
  /** Time since the run started (or its total once finished), in ms. */
  elapsedMs: number;
  customerEmail: string | null;
  whatsappOptIn: boolean;
  onWhatsappOptInChange: (optIn: boolean) => void;
  onSubmit: (request: FinderRequest) => void;
  onReset: () => void;
  onAddToBag?: (candidate: FinderCandidateState) => Promise<void> | void;
  /** Tomame's buyer line, national or international form; null hides the WhatsApp handoff. */
  buyerWhatsappNumber: string | null;
  className?: string;
}

/**
 * The whole "Tell us what you want" screen, driven only by `state`. The live
 * job and the recorded preview both feed it events through `finderReducer`.
 *
 * Laid out against its own width (container queries), not the viewport's, so
 * it is the same component in a phone frame, a side panel or a full page.
 */
export function FinderExperience({
  state,
  elapsedMs,
  customerEmail,
  whatsappOptIn,
  onWhatsappOptInChange,
  onSubmit,
  onReset,
  onAddToBag,
  buyerWhatsappNumber,
  className,
}: FinderExperienceProps) {
  const headerRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const nothingRef = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(state.phase);

  // Focus follows the run: the request when it starts, the answer when it lands.
  useEffect(() => {
    if (previousPhase.current === state.phase) return;
    previousPhase.current = state.phase;
    const target =
      state.phase === "working" ? headerRef : state.phase === "result" ? resultRef : state.phase === "nothing_found" ? nothingRef : null;
    target?.current?.focus();
  }, [state.phase]);

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("@container w-full", className)}>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {state.narration}
        </p>
        {state.phase === "asking" ? (
          <FinderAsk onSubmit={onSubmit} />
        ) : (
          <FinderRun
            state={state}
            elapsedMs={elapsedMs}
            customerEmail={customerEmail}
            whatsappOptIn={whatsappOptIn}
            onWhatsappOptInChange={onWhatsappOptInChange}
            onReset={onReset}
            onAddToBag={onAddToBag}
            buyerWhatsappNumber={buyerWhatsappNumber}
            headerRef={headerRef}
            resultRef={resultRef}
            nothingRef={nothingRef}
          />
        )}
      </div>
    </MotionConfig>
  );
}

interface FinderRunProps
  extends Omit<FinderExperienceProps, "onSubmit" | "className"> {
  headerRef: React.RefObject<HTMLHeadingElement | null>;
  resultRef: React.RefObject<HTMLHeadingElement | null>;
  nothingRef: React.RefObject<HTMLHeadingElement | null>;
}

function FinderRun({
  state,
  elapsedMs,
  customerEmail,
  whatsappOptIn,
  onWhatsappOptInChange,
  onReset,
  onAddToBag,
  buyerWhatsappNumber,
  headerRef,
  resultRef,
  nothingRef,
}: FinderRunProps) {
  const phase = state.phase === "asking" ? "working" : state.phase;
  const finished = phase !== "working";
  const timeline = (
    <div className="@4xl:col-start-2 @4xl:row-start-2 @4xl:self-start">
      <FinderTimeline steps={state.steps} spec={state.spec} stores={state.stores} collapsible={finished} />
    </div>
  );

  return (
    <LayoutGroup>
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-4 py-6 @md:px-6",
          "@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_360px] @4xl:grid-rows-[auto_auto_1fr] @4xl:gap-x-8 @4xl:gap-y-5 @4xl:py-10",
        )}
      >
        <div className="@4xl:col-span-2">
          <FinderRunHeader ref={headerRef} phase={phase} query={state.query ?? ""} elapsedMs={elapsedMs} />
        </div>

        {/* On a phone the steps lead while working and step aside once there is an answer.
            Moved in the DOM rather than with `order`, so tab order matches what is seen. */}
        {!finished && timeline}

        <div className="@4xl:col-start-1 @4xl:row-span-2 @4xl:row-start-2">
          {phase === "working" && <WorkingMatches candidates={state.candidates} />}
          {phase === "result" && <Results state={state} headingRef={resultRef} onAddToBag={onAddToBag} />}
          {phase === "nothing_found" && state.nothingFound && (
            <FinderNothingFound
              ref={nothingRef}
              message={state.nothingFound.message}
              whatsappText={state.nothingFound.whatsappText}
              whatsappHref={buyerWhatsappNumber ? buyerWhatsappHref(buyerWhatsappNumber, state.nothingFound.whatsappText) : null}
              onSearchAgain={onReset}
            />
          )}
        </div>

        {finished && timeline}

        <div className="@4xl:sticky @4xl:top-6 @4xl:col-start-2 @4xl:row-start-3 @4xl:self-start">
          <FinderLeaveAnytime
            phase={phase}
            email={customerEmail}
            whatsappOptIn={whatsappOptIn}
            onWhatsappOptInChange={onWhatsappOptInChange}
          />
        </div>
      </div>
    </LayoutGroup>
  );
}

function WorkingMatches({ candidates }: { candidates: FinderCandidateState[] }) {
  const headingId = useId();
  const slots = Math.max(MATCH_SLOTS, candidates.length);
  return (
    <motion.section layout="position" transition={SPRING.layout} aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Matches so far
        </h2>
        <span className="tm-nums text-[13px] text-muted-foreground">
          {candidates.length === 0 ? "Looking" : `${candidates.length} found`}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: slots }, (_, i) => {
          const c = candidates[i];
          return <li key={c?.id ?? `slot-${i}`}>{c ? <FinderCandidateCard candidate={c} /> : <FinderCandidateSlot />}</li>;
        })}
      </ul>
    </motion.section>
  );
}

function Results({
  state,
  headingRef,
  onAddToBag,
}: {
  state: FinderState;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAddToBag?: (candidate: FinderCandidateState) => Promise<void> | void;
}) {
  const headingId = useId();
  const ranked = selectRankedCandidates(state);
  const best = state.result?.bestId ? ranked[0] : undefined;
  const others = best ? ranked.slice(1) : ranked;
  const rate = best?.quote?.exchangeRate ?? others.find((c) => c.quote)?.quote?.exchangeRate ?? null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <motion.h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        variants={riseIn}
        initial="hidden"
        animate="visible"
        className="text-[22px] font-bold leading-tight outline-none @md:text-[26px]"
      >
        {best ? "Best price, landed in Accra" : "We are confirming prices with the stores"}
      </motion.h2>
      {best && <FinderResultCard featured candidate={best} onAddToBag={onAddToBag} />}
      {others.length > 0 && (
        <>
          <motion.h3
            layout="position"
            transition={SPRING.layout}
            className="mt-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            {best ? "Other options" : "Matches"}
          </motion.h3>
          <div className="grid gap-4 @4xl:grid-cols-2 @4xl:items-start">
            {others.map((c) => (
              <FinderResultCard key={c.id} candidate={c} onAddToBag={onAddToBag} />
            ))}
          </div>
        </>
      )}
      <motion.p layout="position" transition={SPRING.layout} className="text-[13px] leading-relaxed text-muted-foreground">
        Every total includes US sales tax, the Tomame fee (4% flat on the item price) and freight to Accra with customs
        and clearance{rate ? `, at ${formatGhs(rate)} to the dollar` : ""}. We check the price with the store again
        before you pay.
      </motion.p>
    </section>
  );
}
