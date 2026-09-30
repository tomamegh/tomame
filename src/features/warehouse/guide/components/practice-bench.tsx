"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  BellIcon,
  BoxIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LockIcon,
  LockOpenIcon,
  PauseCircleIcon,
  PlaneTakeoffIcon,
  PrinterIcon,
  RotateCcwIcon,
  ScaleIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { PackageBox } from "@/features/warehouse/components/package-box";
import { sanitiseDecimal } from "@/features/warehouse/components/format";
import { cn } from "@/lib/utils";

import { markPracticeDone } from "../progress";
import {
  formatSimLbs,
  initialSimState,
  isSelectable,
  isSimComplete,
  simGoals,
  simPackageWeight,
  simReducer,
  simSealBlocker,
  type SimParcel,
  type SimState,
  type SimTone,
} from "../simulator";
import { useGuideProgress } from "../use-guide-progress";

/**
 * The practice bench (081 guide). A small, honest copy of Receive and a
 * package page, driven by `simulator.ts` — no network, nothing saved but the
 * "done" tick. The same box drawing as the real bench opens, closes and gets
 * its stamp as the operator works.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function PracticeBench() {
  const [state, dispatch] = useReducer(simReducer, undefined, initialSimState);
  const [, update] = useGuideProgress();
  const goals = simGoals(state);
  const done = goals.filter((g) => g.done).length;
  const complete = isSimComplete(state);
  const next = goals.find((g) => !g.done);

  useEffect(() => {
    if (complete) update(markPracticeDone);
  }, [complete, update]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Goals */}
      <div className="flex min-w-0 flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5">
          <span className="text-[12px] font-bold tracking-[0.12em] text-tm-coral-strong uppercase">Your first box</span>
          <span className="tm-nums rounded-full bg-tm-paper px-3 py-1.5 text-[12.5px] font-bold text-tm-ink">
            {done} / {goals.length}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "reset" })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-3.5 text-[12.5px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink focus-visible:ring-4 focus-visible:ring-tm-coral/20 focus-visible:outline-none"
          >
            <RotateCcwIcon className="size-3.5" aria-hidden />
            Start over
          </button>
          <p className="col-span-3 text-[13.5px] font-medium text-tm-text-2" aria-live="polite">
            {complete ? "All six done. That is a whole day's flow." : next ? <><b className="text-tm-ink">Next:</b> {next.hint}</> : null}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-tm-hairline" aria-hidden>
          <motion.div className="h-full origin-left rounded-full bg-[image:var(--tm-gradient-cta)]" initial={false} animate={{ scaleX: done / goals.length }} transition={{ duration: 0.5, ease: EASE }} />
        </div>
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal, i) => (
            <li
              key={goal.id}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] font-semibold transition-colors",
                goal.done ? "bg-tm-green-bg text-tm-green-ink" : goal === next ? "bg-tm-tint text-tm-ink" : "bg-tm-paper text-tm-text-3",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  goal.done ? "bg-tm-green text-white" : "border-2 border-current",
                )}
              >
                {goal.done ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                    <CheckIcon className="size-3.5 stroke-[3]" aria-hidden />
                  </motion.span>
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0">
                {goal.label}
                <span className="sr-only">{goal.done ? " (done)" : " (not done yet)"}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <NoticeBar state={state} onDismiss={() => dispatch({ type: "dismiss" })} />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Shelf state={state} dispatch={dispatch} />
        <Bench state={state} dispatch={dispatch} />
      </div>

      <CustomerFeed state={state} />

      <AnimatePresence>{complete ? <Finished onAgain={() => dispatch({ type: "reset" })} /> : null}</AnimatePresence>
    </div>
  );
}

// ── Notice ──────────────────────────────────────────────────────────────────

const NOTICE_STYLE: Record<SimTone, { box: string; icon: typeof InfoIcon }> = {
  success: { box: "border-[#cdebd8] bg-tm-green-bg text-tm-green-ink", icon: CircleCheckIcon },
  warning: { box: "border-[#f5d9b0] bg-tm-amber-bg text-[#7a4a06]", icon: TriangleAlertIcon },
  error: { box: "border-tm-pill-border bg-tm-pill-bg text-tm-coral-strong", icon: CircleAlertIcon },
  info: { box: "border-tm-border bg-card text-tm-ink", icon: InfoIcon },
};

function NoticeBar({ state, onDismiss }: { state: SimState; onDismiss: () => void }) {
  const n = state.notice;
  return (
    <div aria-live="polite" className="min-h-[1px]">
      <AnimatePresence mode="wait" initial={false}>
        {n ? (
          <motion.div
            key={`${n.title}-${state.nextFeedId}-${state.pkg?.printCount ?? 0}-${state.pkg?.status ?? ""}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
            className={cn("flex items-start gap-3 rounded-[16px] border px-4 py-3", NOTICE_STYLE[n.tone].box)}
            role={n.tone === "error" ? "alert" : "status"}
          >
            {(() => {
              const Icon = NOTICE_STYLE[n.tone].icon;
              return <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />;
            })()}
            <p className="min-w-0 flex-1 text-[13.5px] leading-[1.5] font-medium">
              <b className="font-semibold">{n.title}</b>
              {n.detail ? <span className="block opacity-90">{n.detail}</span> : null}
            </p>
            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 hover:bg-black/5 hover:opacity-100">
              <XIcon className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Shelf ───────────────────────────────────────────────────────────────────

type Dispatch = React.Dispatch<Parameters<typeof simReducer>[1]>;

function Shelf({ state, dispatch }: { state: SimState; dispatch: Dispatch }) {
  const [weighing, setWeighing] = useState<string | null>(null);
  const customers = [...new Set(state.parcels.map((p) => p.customer))];
  const selected = state.selected.length;
  const openPkg = state.pkg && state.pkg.status === "packing" ? state.pkg : null;

  return (
    <section aria-labelledby="sim-shelf" className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-tm-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-tm-hairline px-4 py-3.5 sm:px-5">
        <h3 id="sim-shelf" className="font-display text-[17px] font-bold text-tm-ink">
          Receive
        </h3>
        <span className="text-[12px] font-semibold text-tm-text-3">Practice parcels</span>
      </header>
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {customers.map((customer) => {
          const rows = state.parcels.filter((p) => p.customer === customer);
          return (
            <div key={customer} className="overflow-hidden rounded-[18px] border border-tm-border">
              <div className="flex flex-col border-b border-tm-hairline bg-tm-paper/60 px-3.5 py-2.5">
                <span className="text-[13.5px] font-semibold text-tm-ink">{customer}</span>
                <span className="text-[12px] font-medium text-tm-text-3">
                  {rows[0]!.place} · {rows.length} item{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-tm-hairline">
                {rows.map((parcel) => (
                  <ParcelRow
                    key={parcel.id}
                    parcel={parcel}
                    selected={state.selected.includes(parcel.id)}
                    weighing={weighing === parcel.id}
                    onWeigh={(on) => setWeighing(on ? parcel.id : null)}
                    dispatch={dispatch}
                    packageRef={state.pkg?.reference ?? null}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {selected > 0 ? (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="mx-3 mb-3 flex items-center gap-3 rounded-[18px] bg-tm-ink p-2.5 pl-4 text-white sm:mx-4 sm:mb-4"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[14px] font-bold">{selected}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{selected === 1 ? "item selected" : "items selected"}</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "pack" })}
              className="tm-cta-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white focus-visible:ring-4 focus-visible:ring-white/30 focus-visible:outline-none"
            >
              <BoxIcon className="size-4" aria-hidden />
              {openPkg ? `Add to ${openPkg.reference}` : "New package"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const STAGE_LABEL: Record<SimParcel["stage"], { text: string; cls: string }> = {
  expected: { text: "Expected", cls: "bg-tm-paper text-tm-text-2" },
  shelf: { text: "On the shelf", cls: "bg-tm-amber-bg text-[#7a4a06]" },
  packed: { text: "Packed", cls: "bg-tm-pill-bg text-tm-coral-strong" },
  shipped: { text: "Shipped", cls: "bg-tm-green-bg text-tm-green-ink" },
};

function ParcelRow({
  parcel,
  selected,
  weighing,
  onWeigh,
  dispatch,
  packageRef,
}: {
  parcel: SimParcel;
  selected: boolean;
  weighing: boolean;
  onWeigh: (on: boolean) => void;
  dispatch: Dispatch;
  packageRef: string | null;
}) {
  const [weight, setWeight] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pickable = isSelectable(parcel);
  const stage = STAGE_LABEL[parcel.stage];

  useEffect(() => {
    if (weighing) {
      setWeight(parcel.weightLbs ? String(parcel.weightLbs) : "");
      inputRef.current?.focus();
    }
  }, [weighing, parcel.weightLbs]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    dispatch({ type: "receive", id: parcel.id, weight });
    if (Number(weight) > 0) onWeigh(false);
  };

  return (
    <li className={cn("flex flex-col gap-2.5 px-3.5 py-3 transition-colors", selected && "bg-tm-tint/60")}>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => dispatch({ type: "toggle", id: parcel.id })}
          aria-pressed={selected}
          aria-disabled={!pickable}
          aria-label={`Select ${parcel.orderNo}`}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
            selected ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
            !pickable && !selected && "opacity-40",
          )}
        >
          {selected ? <CheckIcon className="size-3.5 stroke-[3]" aria-hidden /> : null}
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[14px] font-semibold text-tm-ink">{parcel.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-tm-text-3">
            <span className="font-mono text-tm-text-2">{parcel.orderNo}</span>
            {parcel.weightLbs !== null ? (
              <span className="text-tm-green-ink">Weighed {formatSimLbs(parcel.weightLbs)}</span>
            ) : (
              <span>~{formatSimLbs(parcel.listedLbs)} listed</span>
            )}
            {parcel.stage === "packed" && packageRef ? <span className="font-semibold text-tm-coral-strong">in {packageRef}</span> : null}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", stage.cls)}>{stage.text}</span>
            {parcel.hold ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-tm-pill-bg px-2 py-0.5 text-[11px] font-bold text-tm-coral-strong">
                <PauseCircleIcon className="size-3" aria-hidden />
                On hold
              </span>
            ) : null}
          </span>
        </span>
        {parcel.stage === "expected" ? (
          <button
            type="button"
            onClick={() => onWeigh(!weighing)}
            aria-expanded={weighing}
            className="tm-cta-gradient inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
          >
            Log in
          </button>
        ) : parcel.stage === "shelf" ? (
          <button
            type="button"
            onClick={() => onWeigh(!weighing)}
            aria-expanded={weighing}
            aria-label={`Re-weigh ${parcel.orderNo}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-2 transition-colors hover:bg-tm-paper hover:text-tm-ink focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none"
          >
            <ScaleIcon className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {weighing ? (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-[16px] bg-tm-paper p-2.5">
              <label className="relative flex min-w-0 flex-1 items-center">
                <span className="sr-only">Weight on the scale for {parcel.orderNo}, in pounds</span>
                <ScaleIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
                <input
                  ref={inputRef}
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(sanitiseDecimal(e.target.value))}
                  placeholder={String(parcel.listedLbs)}
                  className="tm-nums h-11 w-full min-w-0 rounded-[12px] border border-tm-border bg-card pr-10 pl-10 font-display text-[20px] font-bold text-tm-ink outline-none placeholder:text-tm-text-3/50 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
                />
                <span className="pointer-events-none absolute right-3.5 text-[13px] font-bold text-tm-text-3">lb</span>
              </label>
              <button
                type="submit"
                className="tm-cta-gradient inline-flex h-11 shrink-0 items-center rounded-[12px] px-4 text-[13px] font-semibold text-white focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
              >
                {parcel.stage === "shelf" ? "Save weight" : "Log it in"}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

// ── Bench ───────────────────────────────────────────────────────────────────

function Bench({ state, dispatch }: { state: SimState; dispatch: Dispatch }) {
  const reduce = useReducedMotion();
  const [shipping, setShipping] = useState(false);
  const [carrier, setCarrier] = useState("DHL");
  const pkg = state.pkg;
  const blocker = simSealBlocker(state);
  const weight = simPackageWeight(state);
  const items = pkg ? state.parcels.filter((p) => pkg.items.includes(p.id)) : [];

  return (
    <section aria-labelledby="sim-bench" className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-tm-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-tm-hairline px-4 py-3.5 sm:px-5">
        <h3 id="sim-bench" className="font-display text-[17px] font-bold text-tm-ink">
          {pkg ? <span className="font-mono">{pkg.reference}</span> : "The bench"}
        </h3>
        {pkg ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold",
              pkg.status === "packing" && "bg-tm-amber-bg text-[#7a4a06]",
              pkg.status === "sealed" && "bg-tm-pill-bg text-tm-coral-strong",
              pkg.status === "shipped" && "bg-tm-green-bg text-tm-green-ink",
            )}
          >
            <span className={cn("size-1.5 rounded-full", pkg.status === "packing" ? "animate-pulse bg-tm-amber" : pkg.status === "sealed" ? "bg-tm-coral" : "bg-tm-green")} />
            {pkg.status === "packing" ? "Packing" : pkg.status === "sealed" ? "Sealed" : "Shipped"}
          </span>
        ) : null}
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5">
        <div className="relative mx-auto flex h-[176px] w-[190px] items-end justify-center rounded-[20px] bg-[radial-gradient(110%_100%_at_50%_0%,#ffe4d9_0%,#fff1ec_40%,#fdf9f6_80%)] pb-4">
          <motion.div key={pkg?.status ?? "none"} initial={reduce ? false : { scale: 0.94 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
            <PackageBox status={pkg?.status ?? "packing"} reference={pkg?.reference} size={132} />
          </motion.div>
          {pkg && pkg.printCount > 0 && pkg.status !== "packing" ? (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-tm-text-2 shadow-[0_2px_6px_-2px_rgba(43,36,34,.2)]">
              Label ×{pkg.printCount}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {!pkg ? (
            <p className="text-[13.5px] leading-[1.55] font-medium text-tm-text-2">
              Nothing on the bench yet. Log both of Ama&apos;s parcels in, tick them, and press <b>New package</b>.
            </p>
          ) : (
            <>
              <p className="text-[13px] font-medium text-tm-text-2">
                {items.length} item{items.length === 1 ? "" : "s"} · {formatSimLbs(weight)} · Air freight, New York → Accra
              </p>
              <ul className="flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-center gap-2.5 rounded-[12px] bg-tm-paper px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-tm-ink">{item.title}</span>
                        <span className="font-mono text-[11.5px] text-tm-text-3">{item.orderNo}</span>
                      </span>
                      {pkg.status === "packing" ? (
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "remove", id: item.id })}
                          aria-label={`Take ${item.orderNo} out of the package`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-pill-bg hover:text-tm-coral-strong focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none"
                        >
                          <XIcon className="size-3.5" aria-hidden />
                        </button>
                      ) : (
                        <LockIcon className="size-3.5 shrink-0 text-tm-text-3" aria-label="Locked while sealed" />
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-tm-hairline bg-tm-paper/50 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {!pkg || pkg.status === "packing" ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "seal" })}
              aria-describedby={blocker ? "sim-blocker" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none",
                blocker ? "border border-tm-border bg-card text-tm-text-3" : "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]",
              )}
            >
              <LockIcon className="size-4" aria-hidden />
              Seal package
            </button>
          ) : null}
          {pkg && pkg.status !== "shipped" ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "print" })}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none",
                pkg.status === "sealed" && pkg.printCount === 0
                  ? "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]"
                  : "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
              )}
            >
              <PrinterIcon className="size-4" aria-hidden />
              {pkg.printCount ? "Reprint label" : "Print label"}
            </button>
          ) : null}
          {pkg?.status === "sealed" ? (
            <>
              <button
                type="button"
                onClick={() => setShipping(true)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none",
                  pkg.printCount > 0 ? "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]" : "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
                )}
              >
                <PlaneTakeoffIcon className="size-4" aria-hidden />
                Mark shipped
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "reopen" })}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink focus-visible:ring-4 focus-visible:ring-tm-coral/20 focus-visible:outline-none"
              >
                <LockOpenIcon className="size-4" aria-hidden />
                Reopen
              </button>
            </>
          ) : null}
        </div>
        {blocker && (!pkg || pkg.status === "packing") ? (
          <p id="sim-blocker" className="flex items-center gap-1.5 text-[12.5px] font-medium text-tm-text-3">
            <TriangleAlertIcon className="size-3.5 text-tm-amber" aria-hidden />
            {blocker}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {pkg && pkg.printCount > 0 && pkg.status !== "shipped" ? <LabelPrintout key={pkg.printCount} state={state} /> : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {shipping && pkg?.status === "sealed" ? (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({ type: "ship", carrier });
                setShipping(false);
              }}
            >
              <div className="flex flex-col gap-3 rounded-[16px] border border-tm-border bg-card p-3.5">
                <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
                  <b className="text-tm-ink">Ship {pkg.reference}?</b> On the real bench, {pkg.items.length} order{pkg.items.length === 1 ? "" : "s"} move to “in transit” and each
                  customer gets their shipping update. That cannot be undone. Here it is safe.
                </p>
                {pkg.printCount === 0 ? (
                  <p className="flex items-center gap-2 rounded-[12px] bg-tm-amber-bg px-3 py-2 text-[12.5px] font-medium text-[#7a4a06]">
                    <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
                    No label has been printed for this package yet.
                  </p>
                ) : null}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-tm-ink">Carrier</span>
                  <input
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    maxLength={80}
                    className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none focus:border-tm-coral/60"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShipping(false)} className="h-9 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink">
                    Not yet
                  </button>
                  <button type="submit" className="tm-cta-gradient inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white">
                    <PlaneTakeoffIcon className="size-4" aria-hidden />
                    Ship it
                  </button>
                </div>
              </div>
            </motion.form>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** The label sliding out of the printer — the practice version of the 4×6. */
function LabelPrintout({ state }: { state: SimState }) {
  const pkg = state.pkg!;
  const weight = simPackageWeight(state);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-4 rounded-[16px] bg-[#ece7e3] p-3.5">
        <div className="relative h-[118px] w-[84px] shrink-0 overflow-hidden rounded-t-[4px]" aria-hidden>
          <span className="absolute inset-x-0 top-0 z-10 h-2 rounded-full bg-tm-ink/80" />
          <motion.div
            initial={{ y: -110 }}
            animate={{ y: 4 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="mx-auto flex h-[110px] w-[74px] flex-col gap-[3px] bg-white p-[5px] shadow-[0_6px_14px_-8px_rgba(43,36,34,.5)]"
          >
            <span className="flex items-center justify-between bg-tm-ink px-1 py-[2px] text-[6px] font-extrabold text-white">
              <span>tomame</span>
              <span>AIR</span>
            </span>
            <span className="text-[5px] font-extrabold tracking-[0.1em] text-tm-ink">DELIVER TO</span>
            <span className="text-[8px] leading-none font-extrabold text-tm-ink">Ama Owusu</span>
            <span className="h-[2px] w-2/3 rounded-full bg-tm-ink/30" />
            <span className="mt-auto h-[14px] w-full bg-[repeating-linear-gradient(90deg,#2b2422_0_1px,transparent_1px_2px,#2b2422_2px_4px,transparent_4px_5px)]" />
            <span className="text-center font-mono text-[6.5px] font-bold text-tm-ink">{pkg.reference}</span>
          </motion.div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-tm-ink">
            {pkg.printCount === 1 ? "Label printed" : `Label printed ×${pkg.printCount}`}
          </span>
          <span className="text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
            {pkg.status === "packing"
              ? "Printed on an open box, so it could fall out of date. Seal, then print again."
              : `${pkg.items.length} items · ${formatSimLbs(weight)}. Stick it flat on top of the box.`}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── What the customer sees ──────────────────────────────────────────────────

function CustomerFeed({ state }: { state: SimState }) {
  return (
    <section aria-labelledby="sim-feed" className="flex min-w-0 flex-col gap-3 rounded-[24px] border border-tm-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-tm-green-bg text-tm-green-ink">
          <BellIcon className="size-4" aria-hidden />
        </span>
        <h3 id="sim-feed" className="font-display text-[16px] font-bold text-tm-ink">
          What the customers see
        </h3>
      </div>
      {state.feed.length === 0 ? (
        <p className="text-[13px] font-medium text-tm-text-3">Nothing yet. Log a parcel in and Ama&apos;s tracking moves.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {state.feed.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex min-w-0 items-center gap-3 rounded-[14px] bg-tm-paper px-3.5 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-avatar)] text-[10px] font-bold text-tm-coral-strong">
                  {entry.customer
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-tm-text-2">
                  <b className="font-semibold text-tm-ink">{entry.customer.split(" ")[0]}&apos;s tracking:</b> {entry.title}
                  {entry.detail ? <span className="text-tm-text-3"> · {entry.detail}</span> : null}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function Finished({ onAgain }: { onAgain: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="flex min-w-0 flex-col items-center gap-3 rounded-[24px] border border-[#cdebd8] bg-tm-green-bg px-6 py-8 text-center"
      role="status"
    >
      <PackageBox status="shipped" size={110} />
      <h3 className="font-display text-[22px] font-bold text-tm-green-ink">Practice run complete</h3>
      <p className="max-w-[48ch] text-[13.5px] leading-[1.55] font-medium text-tm-green-ink">
        Logged in, packed by customer, sealed, labelled and shipped. That is the whole bench. Saved on this device.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <a
          href="#ready"
          className="tm-cta-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]"
        >
          Take the quick check
          <ArrowRightIcon className="size-4" aria-hidden />
        </a>
        <button type="button" onClick={onAgain} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#cdebd8] bg-card px-4 text-[13px] font-semibold text-tm-ink">
          <RotateCcwIcon className="size-4" aria-hidden />
          Go again
        </button>
      </div>
    </motion.div>
  );
}
