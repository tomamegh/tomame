"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CheckIcon, ChevronDownIcon, ListIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { SECTIONS, SECTION_IDS } from "../content";
import { markVisited, readPercent } from "../progress";
import { useGuideProgress, useHydrated } from "../use-guide-progress";

/**
 * The guide's contents, scroll-spy and reading progress (081).
 *
 * A section counts as read once its heading has sat in the reading band for a
 * moment — a dwell, so that flying past on the way to another chapter does
 * not tick everything in between.
 */

const DWELL_MS = 1200;

function useActiveSection(): string {
  const [active, setActive] = useState(SECTION_IDS[0]!);
  const [, update] = useGuideProgress();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (!hit) return;
        const id = hit.target.id;
        setActive(id);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
          () => update((p) => markVisited(p, id)),
          DWELL_MS,
        );
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));

    // The last chapter is short: reaching the bottom of the page reads it.
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        const last = SECTION_IDS[SECTION_IDS.length - 1]!;
        setActive(last);
        update((p) => markVisited(p, last));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [update]);

  return active;
}

const ActiveContext = createContext<string>(SECTION_IDS[0]!);

/**
 * Wraps the whole guide: runs the one scroll-spy, and makes Motion follow the
 * operator's reduced-motion setting everywhere inside.
 */
export function GuideSpy({ children }: { children: React.ReactNode }) {
  const active = useActiveSection();
  return (
    <MotionConfig reducedMotion="user">
      <ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>
    </MotionConfig>
  );
}

function useContentsState() {
  const active = useContext(ActiveContext);
  const [progress] = useGuideProgress();
  const hydrated = useHydrated();
  const pct = hydrated ? readPercent(progress, SECTION_IDS) : 0;
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;

  const list = (onPick?: () => void) => (
    <ol className="flex flex-col gap-0.5">
      {SECTIONS.map((s, i) => {
        const on = s.id === active;
        const seen = hydrated && progress.visited.includes(s.id);
        return (
          <li key={s.id} className="relative">
            {on ? (
              <motion.span
                layoutId={onPick ? "toc-active-m" : "toc-active"}
                className="absolute inset-0 rounded-[12px] bg-card shadow-[0_6px_16px_-10px_rgba(43,36,34,.35)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <a
              href={`#${s.id}`}
              onClick={onPick}
              aria-current={on ? "location" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none",
                on ? "text-tm-ink" : "text-tm-text-2 hover:text-tm-ink",
              )}
            >
              <span
                className={cn(
                  "tm-nums flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                  seen
                    ? "bg-tm-green text-white"
                    : on
                      ? "bg-tm-ink text-white"
                      : "bg-tm-hairline text-tm-text-3",
                )}
              >
                {seen ? (
                  <CheckIcon className="size-3 stroke-[3]" aria-hidden />
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0 truncate">{s.label}</span>
              {seen ? <span className="sr-only">(read)</span> : null}
            </a>
          </li>
        );
      })}
    </ol>
  );

  return { pct, current, list };
}

/** Desktop: a column beside the chapters. */
export function ContentsRail() {
  const { pct, list } = useContentsState();
  return (
    <nav
      aria-label="Guide contents"
      className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] flex-col gap-4 overflow-y-auto pb-6 lg:flex"
    >
      <div className="flex flex-col gap-2 px-2.5">
        <span className="text-[11px] font-bold tracking-[0.16em] text-tm-text-3 uppercase">
          On this page
        </span>
        <div className="flex items-center gap-2.5">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-tm-hairline"
            aria-hidden
          >
            <motion.div
              className="h-full origin-left rounded-full bg-[image:var(--tm-gradient-cta)]"
              initial={false}
              animate={{ scaleX: pct / 100 }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <span
            className="tm-nums text-[12px] font-bold text-tm-ink"
            aria-label={`${pct} percent read`}
          >
            {pct}%
          </span>
        </div>
      </div>
      {list()}
    </nav>
  );
}

/** Phone and tablet: a sticky bar under the header that opens the list. */
export function ContentsBar() {
  const { pct, current, list } = useContentsState();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="sticky z-30 -mx-4 px-4 lg:hidden"
      style={{ top: "calc(4rem + env(safe-area-inset-top))" }}
    >
      <div className="relative rounded-b-[18px] border-x border-b border-tm-hairline bg-card/95 shadow-[0_12px_28px_-22px_rgba(43,36,34,.5)] backdrop-blur-[12px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="guide-toc-mobile"
          className="flex h-12 w-full items-center gap-3 px-4 text-left focus-visible:outline-none"
        >
          <ListIcon className="size-4 shrink-0 text-tm-text-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-tm-ink">
            <span className="text-tm-text-3">
              {SECTIONS.indexOf(current) + 1}/{SECTIONS.length} ·{" "}
            </span>
            {current.label}
          </span>
          <span className="tm-nums text-[12px] font-bold text-tm-text-2">
            {pct}%
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-tm-text-3 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full"
          aria-hidden
        >
          <div
            className="h-full origin-left bg-[image:var(--tm-gradient-cta)] transition-transform duration-500"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.nav
              id="guide-toc-mobile"
              aria-label="Guide contents"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="max-h-[60dvh] overflow-y-auto border-t border-tm-hairline bg-tm-paper/70 px-2 py-2"
            >
              {list(() => setOpen(false))}
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
