"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HomeIcon, PauseIcon, PlayIcon, PlaneIcon, UsersIcon } from "lucide-react";

import { PackageBox } from "@/features/warehouse/components/package-box";
import { cn } from "@/lib/utils";

/**
 * A consolidated carton's life in four beats (081 guide): two people's
 * parcels, one box, one flight, two doors. It plays itself while on screen,
 * and the beats are buttons too.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const BEATS = [
  { title: "Two customers, one shelf", body: "Ama's earbuds and Kofi's phone case are both logged in and on the shelf." },
  { title: "Packed together", body: "Add items warns “Mixing customers: this becomes a consolidated carton.” The box and its label say so." },
  { title: "One flight", body: "It is sealed, labelled and shipped like any box. Every customer inside is notified." },
  { title: "Broken down in Accra", body: "The team there opens it, reads the manifest, and sends each parcel on to its own door." },
];

const PEOPLE = [
  { name: "Ama", colour: "bg-[#fde1da] text-tm-coral-strong", item: "Earbuds" },
  { name: "Kofi", colour: "bg-[#dff1e6] text-tm-green-ink", item: "Phone case" },
];

export function ConsolidatedGuide() {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || reduce) return;
    const t = window.setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), 3200);
    return () => window.clearTimeout(t);
  }, [beat, playing, visible, reduce]);

  return (
    <div ref={ref} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative flex min-h-[280px] min-w-0 items-center justify-center overflow-hidden rounded-[24px] border border-tm-border bg-[radial-gradient(110%_100%_at_50%_0%,#ffe4d9_0%,#fff1ec_40%,#fdf9f6_80%)] p-6" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={beat}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="flex w-full items-center justify-center"
          >
            {beat === 0 ? (
              <div className="flex items-end gap-8">
                {PEOPLE.map((p, i) => (
                  <div key={p.name} className="flex flex-col items-center gap-3">
                    <motion.span
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.15, type: "spring", stiffness: 260, damping: 18 }}
                      className="flex h-14 w-16 items-center justify-center rounded-[10px] bg-[linear-gradient(180deg,#e7bd89,#cf9859)] text-[10px] font-bold text-white shadow-[0_10px_18px_-10px_rgba(110,62,20,.7)]"
                    >
                      {p.item}
                    </motion.span>
                    <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-bold", p.colour)}>{p.name}</span>
                  </div>
                ))}
              </div>
            ) : beat === 1 ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <PackageBox status="packing" size={150} />
                  {PEOPLE.map((p, i) => (
                    <motion.span
                      key={p.name}
                      initial={{ y: -90, x: i === 0 ? -70 : 70, opacity: 1 }}
                      animate={{ y: 10, x: i === 0 ? -14 : 14, opacity: 0 }}
                      transition={{ duration: 0.9, delay: 0.2 + i * 0.25, ease: EASE }}
                      className="absolute top-0 left-1/2 flex h-9 w-11 -translate-x-1/2 items-center justify-center rounded-[7px] bg-[linear-gradient(180deg,#e7bd89,#cf9859)] text-[9px] font-bold text-white"
                    >
                      {p.name}
                    </motion.span>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tm-ink px-3 py-1 text-[12px] font-semibold text-white">
                  <UsersIcon className="size-3.5" />
                  Consolidated · 2 customers
                </span>
              </div>
            ) : beat === 2 ? (
              <div className="relative flex w-full max-w-[380px] items-center justify-between">
                <PackageBox status="shipped" size={110} />
                <div className="relative mx-3 h-px flex-1 border-t-2 border-dashed border-tm-coral/40">
                  <motion.span
                    initial={{ left: "0%" }}
                    animate={{ left: "88%" }}
                    transition={{ duration: 2.4, ease: "easeInOut" }}
                    className="absolute -top-[13px] text-tm-coral"
                  >
                    <PlaneIcon className="size-6 rotate-45" />
                  </motion.span>
                </div>
                <span className="rounded-full bg-card px-3 py-1.5 font-mono text-[13px] font-bold text-tm-ink shadow-[0_6px_14px_-8px_rgba(43,36,34,.4)]">ACC</span>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <PackageBox status="shipped" open size={110} />
                <div className="flex flex-col gap-3">
                  {PEOPLE.map((p, i) => (
                    <motion.span
                      key={p.name}
                      initial={{ x: -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.2, duration: 0.5, ease: EASE }}
                      className="flex items-center gap-2 rounded-full bg-card py-1.5 pr-3.5 pl-1.5 shadow-[0_6px_14px_-8px_rgba(43,36,34,.4)]"
                    >
                      <span className={cn("flex size-7 items-center justify-center rounded-full", p.colour)}>
                        <HomeIcon className="size-3.5" />
                      </span>
                      <span className="text-[12.5px] font-semibold text-tm-ink">
                        {p.item} → {p.name}&apos;s door
                      </span>
                    </motion.span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <ol className="flex flex-col gap-2">
          {BEATS.map((b, i) => (
            <li key={b.title}>
              <button
                type="button"
                onClick={() => {
                  setBeat(i);
                  setPlaying(false);
                }}
                aria-current={i === beat ? "step" : undefined}
                className={cn(
                  "flex w-full gap-3 rounded-[16px] border p-3.5 text-left transition-colors focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
                  i === beat ? "border-tm-coral/40 bg-card shadow-[0_14px_30px_-24px_rgba(242,91,61,.8)]" : "border-transparent hover:bg-card",
                )}
              >
                <span
                  className={cn(
                    "tm-nums flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                    i === beat ? "bg-[image:var(--tm-gradient-cta)] text-white" : "bg-tm-paper text-tm-text-3",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-tm-ink">{b.title}</span>
                  <span className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{b.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        {reduce ? null : (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-tm-border bg-card px-3.5 text-[12.5px] font-semibold text-tm-text-2 hover:text-tm-ink"
        >
          {playing ? <PauseIcon className="size-3.5" aria-hidden /> : <PlayIcon className="size-3.5" aria-hidden />}
          {playing ? "Pause" : "Play"}
        </button>
        )}
      </div>
    </div>
  );
}
