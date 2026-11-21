"use client";

import { ArrowRight, CaretDown, CheckCircle, MagnifyingGlass, WhatsappLogo } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { riseIn, SPRING } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { buyerWhatsappHref, formatGhs } from "../../format";
import { reduceFinderEvents, selectRankedCandidates } from "../../state/reducer";
import type { FinderCandidateState, FinderRunView } from "../../types";
import { FinderCandidateCard } from "../finder-candidate-card";
import { FinderResultCard } from "../finder-result-card";
import { Shimmer } from "../shimmer";

interface ChatRunCardProps {
  run: FinderRunView;
  buyerWhatsappNumber: string | null;
  onAddToBag: (candidate: FinderCandidateState) => Promise<void>;
  onHandoff: (runId: string) => void;
}

/**
 * One item a chat turn searched for, live: the step it is on while it works,
 * a fast answer when one lands, then the best landed price with the other
 * options folded away. Every figure is the run's own, from the calculator.
 */
export function ChatRunCard({ run, buyerWhatsappNumber, onAddToBag, onHandoff }: ChatRunCardProps) {
  const state = useMemo(() => reduceFinderEvents(run.events), [run.events]);
  const product = state.spec?.product ?? run.query;
  const working = run.status === "pending" || run.status === "running";
  const active = state.steps.find((s) => s.status === "active");
  const stepNo = state.steps.findIndex((s) => s.status === "active") + 1;
  const ranked = state.phase === "result" ? selectRankedCandidates(state) : [];
  const best = state.result?.bestId ? ranked[0] : undefined;
  const others = best ? ranked.slice(1) : ranked;
  const [showOthers, setShowOthers] = useState(false);
  const listings = state.stores.reduce((n, s) => n + (s.listings ?? 0), 0);

  return (
    <LayoutGroup id={`chat-run-${run.id}`}>
      <motion.section
        variants={riseIn}
        initial="hidden"
        animate="visible"
        aria-label={product}
        aria-busy={working || undefined}
        className="flex flex-col gap-3 rounded-3xl border border-tm-border bg-card p-3.5 sm:p-4"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                working ? "bg-tm-tint text-tm-coral-strong" : state.phase === "result" ? "bg-tm-green-bg text-tm-green-ink" : "bg-muted text-muted-foreground",
              )}
            >
              {working ? <MagnifyingGlass size={16} weight="bold" className="tm-pulse-dot" aria-hidden /> : state.phase === "result" ? <CheckCircle size={17} weight="fill" aria-hidden /> : <MagnifyingGlass size={16} aria-hidden />}
            </span>
            <div className="flex min-w-0 flex-col">
              <h3 className="truncate text-[15px] font-bold leading-tight">{product}</h3>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {working
                  ? active
                    ? `Step ${stepNo} of ${state.steps.length} · ${active.label}`
                    : "Starting the search"
                  : state.phase === "result"
                    ? `${listings > 0 ? `${listings} listings from ${state.stores.length} stores · ` : ""}${best ? "best landed price" : "confirming prices"}`
                    : "No match we could stand behind"}
              </p>
            </div>
          </div>
          <Link
            href={`/app/find/${run.id}`}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12.5px] font-semibold text-tm-coral-strong hover:bg-tm-tint"
          >
            {working ? "Watch" : "Details"}
            <ArrowRight size={13} weight="bold" aria-hidden />
          </Link>
        </header>

        {working && (
          <div className="flex flex-col gap-3">
            {state.stores.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Stores">
                {state.stores.map((s) => (
                  <li
                    key={s.store.id}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium",
                      s.status === "done" ? "border-tm-green/30 bg-tm-green-bg text-tm-green-ink" : "border-tm-border text-muted-foreground",
                    )}
                  >
                    {s.status === "done" ? <CheckCircle size={12} weight="fill" aria-hidden /> : <span className="size-1.5 animate-pulse rounded-full bg-tm-coral" />}
                    {s.store.name}
                    {s.listings != null && <span className="tm-nums opacity-70">{s.listings}</span>}
                  </li>
                ))}
              </ul>
            )}
            {state.quickPick ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-tm-green-ink">Ready now</p>
                <FinderResultCard featured candidate={state.quickPick} onAddToBag={onAddToBag} />
                <p className="text-[12.5px] text-muted-foreground">{state.quickPick.reason}</p>
              </div>
            ) : state.candidates.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {state.candidates.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <FinderCandidateCard candidate={c} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-2" aria-hidden>
                <Shimmer className="h-14 w-full rounded-2xl" />
                <Shimmer className="h-14 w-4/5 rounded-2xl" />
              </div>
            )}
          </div>
        )}

        {state.phase === "result" && (
          <div className="flex flex-col gap-3">
            {best ? <FinderResultCard featured candidate={best} onAddToBag={onAddToBag} /> : null}
            {others.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  aria-expanded={showOthers}
                  className="flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-foreground/80 hover:bg-muted"
                >
                  {best ? `${others.length} other option${others.length === 1 ? "" : "s"}` : `${others.length} match${others.length === 1 ? "" : "es"}`}
                  {others[0]?.quote && <span className="tm-nums font-normal text-muted-foreground">from {formatGhs(Math.min(...others.flatMap((o) => (o.quote ? [o.quote.totalGhs] : []))))}</span>}
                  <CaretDown size={13} weight="bold" className={cn("transition-transform", showOthers && "rotate-180")} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {(showOthers || !best) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={SPRING.layout}
                      className="flex flex-col gap-3 overflow-hidden"
                    >
                      {others.map((c) => (
                        <FinderResultCard key={c.id} candidate={c} onAddToBag={onAddToBag} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {(state.phase === "nothing_found" || (!working && state.phase !== "result")) && (
          <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3.5">
            <p className="text-[14px] leading-relaxed text-foreground/85">
              {state.nothingFound?.message ?? "We could not finish this search. Ask again, or a buyer can look by hand."}
            </p>
            {buyerWhatsappNumber && (
              <a
                href={buyerWhatsappHref(buyerWhatsappNumber, state.nothingFound?.whatsappText ?? product) ?? undefined}
                target="_blank"
                rel="noreferrer"
                onClick={() => onHandoff(run.id)}
                className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-tm-green px-4 text-[14px] font-semibold text-white hover:opacity-90"
              >
                <WhatsappLogo size={18} weight="fill" aria-hidden />
                Ask a buyer to find it
              </a>
            )}
          </div>
        )}
      </motion.section>
    </LayoutGroup>
  );
}
