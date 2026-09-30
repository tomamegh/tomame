"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LockIcon, PauseCircleIcon, PlayCircleIcon, QuoteIcon, RotateCcwIcon } from "lucide-react";

import type { OrderFeedbackStatus, OrderFeedbackVerdict } from "@/db/queries/order-feedback";
import {
  canOfferHold,
  feedbackActionLabel,
  feedbackActionsFor,
  feedbackStatusLabel,
  feedbackVerdictLabel,
  isFeedbackConfirmation,
} from "@/features/feedback/components/queue-format";
import { sealBlocker } from "@/features/warehouse/components/format";
import { cn } from "@/lib/utils";

import { HOLD_FACTS, ISSUE_ACTIONS, VERDICTS } from "../content";

/**
 * Holds and customer issues (081 guide), with a working copy of one Issues
 * card. The buttons it offers, their labels and the status words all come from
 * `queue-format.ts` — the same rules the real board runs — and the "will it
 * seal?" line is the real `sealBlocker`.
 */

const MESSAGES: Record<OrderFeedbackVerdict, string> = {
  looks_right: "That's it, thank you!",
  wrong_item: "This isn't what I ordered. I bought a blender.",
  wrong_variant: "I ordered the blue one, this looks black.",
  damaged: "The corner of the box is crushed. Is the kettle OK?",
  other: "Can you check the charger is in the box?",
};

const TONE: Record<string, string> = {
  green: "bg-tm-green-bg text-tm-green-ink",
  amber: "bg-tm-amber-bg text-[#7a4a06]",
  coral: "bg-tm-pill-bg text-tm-coral-strong",
  neutral: "bg-tm-paper text-tm-text-2",
  muted: "bg-tm-paper text-tm-text-3",
};

const REASON_MIN = 3;

export function HoldsGuide() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <IssueDemo />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-[20px] border border-tm-border bg-card p-5">
            <h3 className="font-display text-[16px] font-bold text-tm-ink">What a customer can say</h3>
            <ul className="flex flex-col gap-2">
              {VERDICTS.map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-[1.5] font-medium text-tm-text-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-bold", TONE[v.tone])}>{v.label}</span>
                  <span className="min-w-0">{v.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 rounded-[20px] border border-tm-border bg-card p-5">
            <h3 className="font-display text-[16px] font-bold text-tm-ink">Your three answers</h3>
            <ul className="flex flex-col gap-2.5">
              {ISSUE_ACTIONS.map((a) => (
                <li key={a.label} className="flex flex-col gap-0.5 text-[13px] leading-[1.5] font-medium text-tm-text-2">
                  <span className="font-semibold text-tm-ink">
                    {a.label} <span className="font-medium text-tm-text-3">→ {a.to}</span>
                  </span>
                  {a.body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[22px] border border-[#f5d9b0] bg-tm-amber-bg p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-display text-[17px] font-bold text-[#7a4a06]">
          <PauseCircleIcon className="size-5" aria-hidden />
          How a hold works
        </h3>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 md:grid-cols-2">
          {HOLD_FACTS.map((fact) => (
            <li key={fact} className="flex gap-2.5 text-[13.5px] leading-[1.55] font-medium text-[#7a4a06]">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-tm-amber" aria-hidden />
              <span className="min-w-0">{fact}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function IssueDemo() {
  const [verdict, setVerdict] = useState<OrderFeedbackVerdict>("wrong_variant");
  const [status, setStatus] = useState<OrderFeedbackStatus>("open");
  const [resolution, setResolution] = useState("");
  const [held, setHeld] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const actions = feedbackActionsFor(status, verdict);
  const confirmation = isFeedbackConfirmation(verdict);
  const blocker = sealBlocker({ status: "packing", line_count: 2, held_count: held ? 1 : 0 });
  const verdictTone = VERDICTS.find((v) => v.id === verdict)?.tone ?? "neutral";
  const statusTone = confirmation ? "green" : status === "open" ? "amber" : status === "in_review" ? "coral" : status === "resolved" ? "green" : "muted";

  const reset = () => {
    setStatus("open");
    setResolution("");
    setHeld(null);
    setHoldOpen(false);
    setReason("");
    setReasonError(null);
  };

  const placeHold = () => {
    if (reason.trim().length < REASON_MIN) {
      setReasonError("Say why this parcel is being stopped. The customer will be asked.");
      return;
    }
    setHeld(reason.trim());
    setHoldOpen(false);
    setReasonError(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[17px] font-bold text-tm-ink">Work a real-looking issue</h3>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-tm-text-2">
          The customer said
          <select
            value={verdict}
            onChange={(e) => {
              setVerdict(e.target.value as OrderFeedbackVerdict);
              reset();
            }}
            className="h-8 rounded-full border border-tm-border bg-card px-3 text-[12.5px] font-semibold text-tm-ink outline-none focus:ring-4 focus:ring-tm-coral/15"
          >
            {VERDICTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold", TONE[verdictTone])}>{feedbackVerdictLabel(verdict)}</span>
          <motion.span key={status} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold", TONE[statusTone])}>
            {feedbackStatusLabel(status, verdict)}
          </motion.span>
          {held ? <span className={cn("rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold", TONE.coral)}>On hold</span> : null}
          <span className="ml-auto text-[12px] font-medium text-tm-text-3">12 min ago</span>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
          <span className="flex size-[84px] items-end justify-center overflow-hidden rounded-[16px] bg-[linear-gradient(160deg,#dfe8f5,#c9d4e6)]" aria-hidden>
            <span className="mb-3 h-11 w-12 rounded-[8px] bg-[linear-gradient(180deg,#e0ad72,#c48b4d)] shadow-[0_6px_12px_-6px_rgba(110,62,20,.7)]" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14px] font-semibold text-tm-ink">Stainless steel water bottle, 32 oz</span>
              <span className="text-[12px] font-medium text-tm-text-3">
                <span className="font-mono text-tm-text-2">TM-00088</span> · Esi Mensah
              </span>
            </span>
            <blockquote className="relative rounded-[14px] bg-tm-paper px-3.5 py-2.5 pl-9 text-[13px] leading-[1.5] font-medium text-tm-ink">
              <QuoteIcon className="absolute top-3 left-3 size-3.5 text-tm-text-3" aria-hidden />
              {MESSAGES[verdict]}
            </blockquote>
          </div>
        </div>

        {status === "resolved" || status === "dismissed" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-tm-hairline pt-4">
            <p className="min-w-0 flex-1 text-[12.5px] font-medium text-tm-text-2">
              {resolution.trim() ? (
                <>
                  <span className="font-semibold text-tm-ink">We said:</span> {resolution.trim()}
                </>
              ) : (
                "Closed without a note. Next time, tell the customer what you did."
              )}
            </p>
            <button type="button" onClick={reset} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-tm-text-2 hover:text-tm-ink">
              <RotateCcwIcon className="size-3.5" aria-hidden />
              Again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-tm-hairline pt-4">
            {actions.some((a) => a !== "in_review") && !confirmation ? (
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={2}
                aria-label="What you did about it"
                placeholder="What you did about it. The customer reads this."
                className="resize-none rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setStatus(action)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
                    action === "resolved"
                      ? "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]"
                      : action === "dismissed"
                        ? "text-tm-text-2 hover:bg-tm-paper hover:text-tm-ink"
                        : "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
                  )}
                >
                  {feedbackActionLabel(action, verdict)}
                </button>
              ))}
              {canOfferHold(status, verdict) ? (
                held ? (
                  <button
                    type="button"
                    onClick={() => setHeld(null)}
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink hover:bg-tm-paper"
                  >
                    <PlayCircleIcon className="size-4" aria-hidden />
                    Release parcel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHoldOpen((o) => !o)}
                    aria-expanded={holdOpen}
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-tm-pill-bg px-4 text-[13px] font-semibold text-tm-coral-strong hover:bg-tm-tint"
                  >
                    <PauseCircleIcon className="size-4" aria-hidden />
                    Hold parcel
                  </button>
                )
              ) : null}
            </div>
            <AnimatePresence initial={false}>
              {holdOpen ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 rounded-[16px] bg-tm-paper p-3.5">
                    <label htmlFor="demo-hold" className="text-[13px] font-semibold text-tm-ink">
                      Why are you stopping it?
                    </label>
                    <textarea
                      id="demo-hold"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      aria-invalid={!!reasonError}
                      aria-describedby={reasonError ? "demo-hold-error" : undefined}
                      placeholder="e.g. Customer says it is black, they paid for blue. Do not ship until checked."
                      className="resize-none rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
                    />
                    {reasonError ? (
                      <p id="demo-hold-error" role="alert" className="text-[12px] font-medium text-tm-amber">
                        {reasonError}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setHoldOpen(false)} className="h-9 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink">
                        Cancel
                      </button>
                      <button type="button" onClick={placeHold} className="h-9 rounded-full bg-tm-coral-strong px-4 text-[13px] font-semibold text-white hover:bg-tm-coral">
                        Put it on hold
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* The consequence, right under the cause */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-[16px] border px-4 py-3 text-[13px] font-medium transition-colors",
          held ? "border-tm-pill-border bg-tm-pill-bg text-tm-coral-strong" : "border-tm-border bg-card text-tm-text-2",
        )}
        aria-live="polite"
      >
        <LockIcon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          Its box, <span className="font-mono font-semibold">PKG-10042</span>:{" "}
          {blocker ? <b>Seal package is greyed out: “{blocker}”</b> : "can be sealed. Nothing is stopping it."}
        </span>
      </div>
    </div>
  );
}
