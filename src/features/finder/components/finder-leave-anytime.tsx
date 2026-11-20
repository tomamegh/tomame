"use client";

import { CheckCircle, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";

import { fadeIn, SPRING } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import type { FinderPhase } from "../types";

interface FinderLeaveAnytimeProps {
  phase: Exclude<FinderPhase, "asking">;
  /** The signed-in customer's address; null when we have none to send to. */
  email: string | null;
  whatsappOptIn: boolean;
  onWhatsappOptInChange: (optIn: boolean) => void;
}

/**
 * The promise that makes waiting optional: close the page, the result comes
 * by email. Stated once, calmly, and kept in view; never a pop-up.
 */
export function FinderLeaveAnytime({ phase, email, whatsappOptIn, onWhatsappOptInChange }: FinderLeaveAnytimeProps) {
  const switchId = useId();
  const sent = phase !== "working";

  return (
    <motion.section
      layout="position"
      transition={SPRING.layout}
      aria-label="Getting your result"
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-4 @md:p-5"
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
            sent ? "bg-tm-green-bg text-tm-green dark:bg-tm-green/15" : "bg-tm-tint text-tm-coral dark:bg-tm-coral/15",
          )}
        >
          {sent ? <CheckCircle size={20} weight="fill" aria-hidden /> : <EnvelopeSimple size={20} weight="duotone" aria-hidden />}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={sent ? "sent" : "waiting"} variants={fadeIn} initial="hidden" animate="visible" exit="exit" className="flex min-w-0 flex-col gap-1">
            <p className="text-[15px] font-semibold leading-snug">
              {!sent
                ? "We'll email you the best price"
                : phase === "result"
                  ? "We've emailed you these results"
                  : "We've emailed you this too"}
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {email ? (
                <>
                  {sent ? "Sent to " : "You can close this page. It goes to "}
                  <span className="break-all font-medium text-foreground">{email}</span>
                  {sent ? (whatsappOptIn ? " and to your WhatsApp." : ".") : " as soon as it is ready."}
                </>
              ) : (
                "Keep this page open to see the result."
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {!sent && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3">
          <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <WhatsappLogo size={18} weight="fill" className="text-tm-green" aria-hidden />
            Also send on WhatsApp
          </label>
          <Switch id={switchId} checked={whatsappOptIn} onCheckedChange={onWhatsappOptInChange} />
        </div>
      )}
    </motion.section>
  );
}

/** A 44 px switch: the thumb slides by transform, the track colour cross-fades. */
function Switch({ id, checked, onCheckedChange }: { id: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="group relative flex h-11 w-14 shrink-0 items-center justify-center rounded-full outline-none"
    >
      <span
        className={cn(
          "relative h-7 w-12 rounded-full border transition-colors duration-200 group-focus-visible:ring-4 group-focus-visible:ring-tm-coral/20",
          checked ? "border-tm-green bg-tm-green" : "border-border bg-muted",
        )}
      >
        <motion.span
          aria-hidden
          className="absolute left-0.5 top-0.5 size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(43,36,34,.25)]"
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={SPRING.snappy}
        />
      </span>
    </button>
  );
}
