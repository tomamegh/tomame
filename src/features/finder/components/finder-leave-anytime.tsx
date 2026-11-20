"use client";

import { CheckCircle, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";

import { fadeIn, SPRING } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import type { FinderPhase } from "../types";

interface FinderLeaveAnytimeProps {
  phase: Exclude<FinderPhase, "asking">;
  /** The signed-in customer's address; null when we have none to send to. */
  email: string | null;
  whatsappOptIn: boolean;
  onWhatsappOptInChange: (optIn: boolean) => void;
  /**
   * A visitor with no address on file can give one here. Resolves once saved;
   * rejects with a message to show. Absent: no form (a signed-in account's
   * result goes to the account's own address).
   */
  onEmailSubmit?: (email: string) => Promise<void>;
  /** Hide the WhatsApp switch (a visitor has no WhatsApp number on file). */
  whatsappAvailable?: boolean;
}

/**
 * The promise that makes waiting optional: close the page, the result comes
 * by email. Stated once, calmly, and kept in view; never a pop-up.
 */
export function FinderLeaveAnytime({
  phase,
  email,
  whatsappOptIn,
  onWhatsappOptInChange,
  onEmailSubmit,
  whatsappAvailable = true,
}: FinderLeaveAnytimeProps) {
  const switchId = useId();
  const sent = phase !== "working" && email != null;

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
              {email == null
                ? phase === "working"
                  ? "Leave anytime"
                  : "Keep a copy"
                : !sent
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
              ) : onEmailSubmit ? (
                phase === "working" ? (
                  "Add your email and close this page. The result comes to you as soon as it is ready."
                ) : (
                  "Add your email and we will send you this result."
                )
              ) : (
                "Keep this page open to see the result."
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {email == null && onEmailSubmit && <EmailForm onSubmit={onEmailSubmit} />}

      {phase === "working" && whatsappAvailable && (
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

/** A visitor's address, saved to the run. Enter submits; the error says what to fix. */
function EmailForm({ onSubmit }: { onSubmit: (email: string) => Promise<void> }) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 border-t border-border pt-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        Email address
      </label>
      <div className="flex flex-col gap-2 @md:flex-row">
        <input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="name@example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 @md:text-[15px]",
            "placeholder:text-muted-foreground/70 focus-visible:border-tm-coral focus-visible:ring-4 focus-visible:ring-tm-coral/15",
            error && "border-destructive",
          )}
        />
        <Button type="submit" variant="secondary" className="h-11 rounded-xl text-[15px]" disabled={saving} aria-busy={saving || undefined}>
          {saving ? "Saving" : "Email me"}
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
