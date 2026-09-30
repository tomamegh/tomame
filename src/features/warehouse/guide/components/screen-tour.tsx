"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRightIcon, LightbulbIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { SCREENS, type ScreenInfo } from "../content";
import { GuideVideo } from "./guide-video";

/**
 * Every screen, one tab each (081 guide). Screens with a recording play it;
 * the two without (Overview, Issues) get a sketch of their layout so the
 * operator knows the shape before they open it.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function ScreenTour() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const screen = SCREENS[active]!;

  const onKey = (event: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: SCREENS.length - 1 };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const clamped = (next + SCREENS.length) % SCREENS.length;
    setActive(clamped);
    tabs.current[clamped]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="tablist"
        aria-label="Warehouse screens"
        onKeyDown={onKey}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {SCREENS.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`screen-tab-${s.id}`}
            aria-selected={i === active}
            aria-controls="screen-panel"
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
              i === active ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div id="screen-panel" role="tabpanel" aria-labelledby={`screen-tab-${screen.id}`} className="min-w-0 overflow-hidden rounded-[24px] border border-tm-border bg-card">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.3, ease: EASE }}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="w-fit max-w-full truncate rounded-full bg-tm-paper px-2.5 py-1 font-mono text-[12px] font-semibold text-tm-text-2">{screen.path}</span>
                <h3 className="font-display text-[22px] leading-tight font-bold text-tm-ink">{screen.name}</h3>
                <p className="text-[14px] leading-[1.55] font-medium text-tm-text-2">{screen.purpose}</p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {screen.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[13.5px] leading-[1.55] font-medium text-tm-ink">
                    <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-tm-coral" aria-hidden />
                    <span className="min-w-0">{point}</span>
                  </li>
                ))}
              </ul>
              <p className="flex gap-2.5 rounded-[16px] bg-tm-tint px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-ink">
                <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-tm-coral-strong" aria-hidden />
                <span>{screen.tip}</span>
              </p>
              <Link
                href={screen.href}
                className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-tm-coral-strong underline-offset-4 hover:underline"
              >
                Open {screen.name}
                <ArrowUpRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="flex min-w-0 items-start justify-center">
              {screen.clip ? <GuideVideo clip={screen.clip} size="sm" /> : <ScreenSketch screen={screen} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A wireframe of a screen we did not film, in the app's own palette. */
function ScreenSketch({ screen }: { screen: ScreenInfo }) {
  const bar = "rounded-full bg-tm-hairline";
  return (
    <figure className="flex w-full max-w-[520px] flex-col gap-3">
      <div aria-hidden className="overflow-hidden rounded-[18px] border border-tm-border bg-tm-paper shadow-[0_30px_60px_-34px_rgba(43,36,34,0.45)]">
        <div className="flex h-9 items-center gap-2 border-b border-tm-hairline bg-card px-3.5">
          <span className="size-4 rounded-[5px] bg-[image:var(--tm-gradient-cta)]" />
          <span className={cn(bar, "h-2 w-16")} />
          <span className="ml-auto h-5 w-12 rounded-full bg-[image:var(--tm-gradient-cta)] opacity-80" />
        </div>
        {screen.id === "overview" ? (
          <div className="flex flex-col gap-3 p-4">
            <span className={cn(bar, "h-3 w-40 bg-tm-ink/80")} />
            <div className="grid grid-cols-5 gap-2">
              {["Expected", "Shelf", "Packing", "Sealed", "Shipped"].map((label, i) => (
                <div key={label} className="flex flex-col gap-1.5 rounded-[12px] border border-tm-border bg-card p-2">
                  <span className="tm-nums font-display text-[16px] leading-none font-bold text-tm-ink">{[4, 2, 1, 1, 6][i]}</span>
                  <span className="truncate text-[9px] font-semibold text-tm-text-3">{label}</span>
                </div>
              ))}
            </div>
            <div className="rounded-[12px] border border-[#f5d9b0] bg-tm-amber-bg px-3 py-2 text-[10px] font-semibold text-[#7a4a06]">
              1 customer issue open · 1 item on hold. Check before you seal anything.
            </div>
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <div className="flex flex-col gap-2 rounded-[12px] border border-tm-border bg-card p-3">
                <span className="text-[10px] font-bold text-tm-ink">On the bench</span>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-14 rounded-[10px] bg-[radial-gradient(120%_90%_at_50%_0%,#fff1ec_0%,#fdf9f6_60%)]" />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-[12px] border border-tm-border bg-card p-3">
                <span className="text-[10px] font-bold text-tm-ink">Ready to pack</span>
                <span className={cn(bar, "h-2 w-full")} />
                <span className={cn(bar, "h-2 w-3/4")} />
                <span className="h-5 w-12 rounded-full bg-[image:var(--tm-gradient-cta)] opacity-80" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-1.5">
              {["Waiting", "Being looked at", "Sorted"].map((t, i) => (
                <span key={t} className={cn("rounded-full px-2.5 py-1 text-[9.5px] font-semibold", i === 0 ? "bg-tm-ink text-white" : "border border-tm-border bg-card text-tm-text-2")}>
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-[14px] border border-tm-border bg-card p-3">
              <div className="flex gap-1.5">
                <span className="rounded-full bg-tm-amber-bg px-2 py-0.5 text-[9px] font-bold text-[#7a4a06]">Wrong size or colour</span>
                <span className="rounded-full bg-tm-amber-bg px-2 py-0.5 text-[9px] font-bold text-[#7a4a06]">Waiting</span>
              </div>
              <div className="flex gap-3">
                <span className="size-14 shrink-0 rounded-[10px] bg-[linear-gradient(135deg,#e7d9cf,#f5eee9)]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className={cn(bar, "h-2 w-3/4 bg-tm-ink/70")} />
                  <span className="rounded-[8px] bg-tm-paper px-2 py-1.5 text-[9.5px] leading-snug font-medium text-tm-ink">“I ordered the blue one, this looks black.”</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-tm-hairline pt-2.5">
                {["I'm on it", "Sorted", "Nothing in it"].map((a, i) => (
                  <span key={a} className={cn("rounded-full px-2.5 py-1 text-[9.5px] font-semibold", i === 1 ? "bg-[image:var(--tm-gradient-cta)] text-white" : "border border-tm-border bg-card text-tm-ink")}>
                    {a}
                  </span>
                ))}
                <span className="ml-auto rounded-full bg-tm-pill-bg px-2.5 py-1 text-[9.5px] font-semibold text-tm-coral-strong">Hold parcel</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <figcaption className="text-center text-[12.5px] font-medium text-tm-text-3">A sketch of {screen.name}, not a recording.</figcaption>
    </figure>
  );
}
