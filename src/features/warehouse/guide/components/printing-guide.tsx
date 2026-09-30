"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon, ChevronDownIcon, PrinterIcon, RotateCcwIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { LABEL_SIZES, PRINT_DIALOG, REPRINT_FACTS, TROUBLESHOOTING, type LabelSize } from "../content";

/**
 * Printing, taught by doing (081 guide): pick the paper, then get a mock print
 * dialog right. It starts on the browser's usual defaults — which are wrong for
 * a label — because that is exactly what an operator meets on day one.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const BROWSER_DEFAULTS: Record<string, string> = {
  browser: "safari",
  destination: "pdf",
  paper: "letter",
  margins: "default",
  scale: "fit",
  headers: "on",
};

export function PrintingGuide() {
  const [size, setSize] = useState<LabelSize>("4x6");
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <SizePicker size={size} onChange={setSize} />
      <DialogTrainer size={size} />
      <Troubleshooter />
      <Reprints />
    </div>
  );
}

function SizePicker({ size, onChange }: { size: LabelSize; onChange: (s: LabelSize) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="font-display text-[18px] font-bold text-tm-ink">1. Which printer, which paper</h3>
      <div role="radiogroup" aria-label="Label size" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LABEL_SIZES.map((s) => {
          const on = s.id === size;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s.id)}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-[20px] border p-4 text-left transition-[border-color,box-shadow,transform] focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
                on ? "border-tm-coral/60 bg-card shadow-[0_18px_40px_-28px_rgba(242,91,61,0.7)]" : "border-tm-border bg-card hover:-translate-y-0.5 hover:border-tm-coral/30",
              )}
            >
              <div className="flex h-[92px] items-center justify-center rounded-[14px] bg-[#ece7e3]">
                <PaperSketch ratio={s.ratio} kind={s.id} />
              </div>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-bold text-tm-ink">{s.tab}</span>
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border")}>
                    {on ? <CheckIcon className="size-3 stroke-[3]" aria-hidden /> : null}
                  </span>
                </span>
                <span className="text-[12px] font-semibold text-tm-text-2">
                  {s.printer} · {s.paper}
                </span>
                <span className="text-[12px] leading-[1.45] font-medium text-tm-text-3">{s.use}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PaperSketch({ ratio, kind }: { ratio: number; kind: LabelSize }) {
  const h = ratio >= 1 ? 30 : 78;
  const w = Math.round(h * ratio);
  return (
    <span className="flex flex-col overflow-hidden rounded-[3px] bg-white p-[3px] shadow-[0_6px_14px_-8px_rgba(43,36,34,.5)]" style={{ width: w, height: h }} aria-hidden>
      {kind === "2x1" ? (
        <span className="flex h-full gap-[3px]">
          <span className="aspect-square h-full bg-[linear-gradient(90deg,#2b2422_50%,transparent_0),linear-gradient(#2b2422_50%,transparent_0)] bg-[length:4px_4px] opacity-80" />
          <span className="flex flex-1 flex-col justify-center gap-[3px]">
            <span className="h-[3px] w-full rounded-full bg-tm-ink" />
            <span className="h-[2px] w-2/3 rounded-full bg-tm-ink/40" />
          </span>
        </span>
      ) : kind === "manifest" ? (
        <span className="flex h-full flex-col gap-[3px]">
          <span className="h-[5px] w-2/3 rounded-full bg-tm-ink" />
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="h-[2px] w-full rounded-full bg-tm-ink/30" />
          ))}
        </span>
      ) : (
        <span className="flex h-full flex-col gap-[3px]">
          <span className="h-[6px] w-full bg-tm-ink" />
          <span className="h-[3px] w-2/3 rounded-full bg-tm-ink/70" />
          <span className="h-[2px] w-1/2 rounded-full bg-tm-ink/30" />
          <span className="mt-auto h-[12px] w-full bg-[repeating-linear-gradient(90deg,#2b2422_0_1px,transparent_1px_2px,#2b2422_2px_4px,transparent_4px_5px)]" />
          <span className="flex gap-[3px]">
            <span className="aspect-square h-[14px] bg-[linear-gradient(90deg,#2b2422_50%,transparent_0),linear-gradient(#2b2422_50%,transparent_0)] bg-[length:3px_3px]" />
            <span className="h-[3px] flex-1 self-center rounded-full bg-tm-ink/40" />
          </span>
        </span>
      )}
    </span>
  );
}

function DialogTrainer({ size }: { size: LabelSize }) {
  const reduce = useReducedMotion();
  const [values, setValues] = useState<Record<string, string>>(BROWSER_DEFAULTS);
  const [checked, setChecked] = useState(false);
  const label = LABEL_SIZES.find((s) => s.id === size)!;
  const results = useMemo(
    () => PRINT_DIALOG.map((row) => ({ row, ok: values[row.id] === row.correct(size) })),
    [values, size],
  );
  const allRight = results.every((r) => r.ok);
  const rightCount = results.filter((r) => r.ok).length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-[18px] font-bold text-tm-ink">2. Get the print dialog right</h3>
        <span className="text-[12.5px] font-semibold text-tm-text-3" aria-live="polite">
          {rightCount} of {PRINT_DIALOG.length} right for {label.tab}
        </span>
      </div>
      <p className="max-w-[68ch] text-[13.5px] leading-[1.55] font-medium text-tm-text-2">
        This is the dialog you see after pressing <b>Print</b>, set the way a browser sets it for a letter. Change each setting until it is right
        for the size you picked above, then check it.
      </p>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[22px] border border-tm-border bg-card lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col divide-y divide-tm-hairline">
          <div className="flex items-center gap-2 px-5 py-3.5">
            <PrinterIcon className="size-4 text-tm-text-3" aria-hidden />
            <span className="text-[14px] font-bold text-tm-ink">Print</span>
            <span className="ml-auto text-[12px] font-medium text-tm-text-3">1 sheet of label</span>
          </div>
          {results.map(({ row, ok }) => (
            <div key={row.id} className="flex min-w-0 flex-col gap-1.5 px-5 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 sm:grid-cols-[150px_minmax(0,1fr)_24px]">
                <label htmlFor={`pd-${row.id}`} className="text-[13px] font-semibold text-tm-text-2">
                  {row.label}
                </label>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="relative flex min-w-0 flex-1 items-center">
                    <select
                      id={`pd-${row.id}`}
                      value={values[row.id]}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [row.id]: e.target.value }));
                        setChecked(false);
                      }}
                      className={cn(
                        "h-10 w-full min-w-0 appearance-none rounded-[12px] border bg-card pr-9 pl-3 text-[13.5px] font-medium text-tm-ink outline-none focus:ring-4 focus:ring-tm-coral/15",
                        checked && !ok ? "border-tm-coral" : "border-tm-border focus:border-tm-coral/60",
                      )}
                      aria-describedby={checked && !ok ? `pd-${row.id}-why` : undefined}
                    >
                      {row.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.text}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-3 size-4 text-tm-text-3" aria-hidden />
                  </span>
                  <span className="sm:hidden">
                    <Verdict ok={ok} show={checked} />
                  </span>
                </div>
                <span className="hidden sm:block">
                  <Verdict ok={ok} show={checked} />
                </span>
              </div>
              <AnimatePresence initial={false}>
                {checked && !ok ? (
                  <motion.p
                    id={`pd-${row.id}-why`}
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="overflow-hidden text-[12.5px] leading-[1.45] font-medium text-tm-coral-strong sm:pl-[158px]"
                  >
                    {row.why}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 bg-tm-paper/60 px-5 py-3.5">
            <button
              type="button"
              onClick={() => {
                setValues(BROWSER_DEFAULTS);
                setChecked(false);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
            >
              <RotateCcwIcon className="size-3.5" aria-hidden />
              Start over
            </button>
            <button
              type="button"
              onClick={() => setChecked(true)}
              className="tm-cta-gradient ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none"
            >
              Check my settings
            </button>
          </div>
        </div>

        {/* What would come out of the printer */}
        <div className="flex min-w-0 flex-col items-center justify-center gap-3 border-t border-tm-hairline bg-[#ece7e3] p-5 lg:border-t-0 lg:border-l">
          <div className="relative flex h-[190px] w-full items-center justify-center" aria-hidden>
            <motion.div
              key={`${size}-${allRight}`}
              initial={reduce ? false : { y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: EASE }}
              className={cn("origin-center transition-transform duration-500", allRight ? "scale-100" : "scale-[0.62] -rotate-2")}
            >
              <PaperSketch ratio={label.ratio} kind={size} />
            </motion.div>
            {!allRight ? (
              <span className="absolute right-3 bottom-2 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-semibold text-tm-text-2">shrunk, off-centre</span>
            ) : null}
          </div>
          <p className="text-center text-[12.5px] leading-[1.45] font-semibold text-tm-ink" aria-live="polite">
            {allRight ? "Real size, edge to edge. Ready to print." : checked ? `${PRINT_DIALOG.length - rightCount} setting${PRINT_DIALOG.length - rightCount === 1 ? "" : "s"} to fix.` : "What these settings would print."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Verdict({ ok, show }: { ok: boolean; show: boolean }) {
  if (!show) return <span className="block size-6" aria-hidden />;
  return ok ? (
    <span className="flex size-6 items-center justify-center rounded-full bg-tm-green text-white" role="img" aria-label="Right">
      <CheckIcon className="size-3.5 stroke-[3]" />
    </span>
  ) : (
    <span className="flex size-6 items-center justify-center rounded-full bg-tm-coral text-white" role="img" aria-label="Needs changing">
      <XIcon className="size-3.5 stroke-[3]" />
    </span>
  );
}

function Troubleshooter() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="font-display text-[18px] font-bold text-tm-ink">3. When a print goes wrong</h3>
      <div className="flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[22px] border border-tm-border bg-card">
        {TROUBLESHOOTING.map((t) => (
          <details key={t.id} className="group/ts">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-tm-paper/60 focus-visible:bg-tm-paper focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-tm-ink">{t.symptom}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-tm-text-3 transition-transform group-open/ts:rotate-180" aria-hidden />
            </summary>
            <ul className="flex flex-col gap-2 px-5 pb-4">
              {t.fixes.map((fix) => (
                <li key={fix} className="flex gap-2.5 text-[13.5px] leading-[1.55] font-medium text-tm-text-2">
                  <CheckIcon className="mt-1 size-3.5 shrink-0 text-tm-green" aria-hidden />
                  <span className="min-w-0">{fix}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function Reprints() {
  const [count, setCount] = useState(0);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-[22px] border border-tm-border bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="font-display text-[18px] font-bold text-tm-ink">4. Reprints are fine, and counted</h3>
        <ul className="flex flex-col gap-2">
          {REPRINT_FACTS.map((fact) => (
            <li key={fact} className="flex gap-2.5 text-[13.5px] leading-[1.55] font-medium text-tm-text-2">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-tm-coral" aria-hidden />
              <span className="min-w-0">{fact}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] bg-tm-paper p-5">
        <span className="font-mono text-[18px] font-bold text-tm-ink">PKG-10042</span>
        <span className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full bg-tm-pill-bg px-2.5 py-1 text-[12px] leading-none font-semibold text-tm-coral-strong">● Sealed</span>
          {count > 0 ? (
            <motion.span key={count} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-card px-2.5 py-1 text-[12px] leading-none font-semibold text-tm-text-2">
              Label printed ×{count}
            </motion.span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none",
            count === 0 ? "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]" : "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
          )}
        >
          <PrinterIcon className="size-4" aria-hidden />
          {count ? "Reprint label" : "Print label"}
        </button>
        <span className="text-center text-[11.5px] font-medium text-tm-text-3">Try it. Nothing is printed.</span>
      </div>
    </div>
  );
}
