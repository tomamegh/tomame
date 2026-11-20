"use client";

import { ArrowCounterClockwise, MagnifyingGlass, WhatsappLogo } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { forwardRef, useId } from "react";

import { Button } from "@/components/ui/button";
import { riseIn, stagger } from "@/lib/motion/presets";

interface FinderNothingFoundProps {
  message: string;
  /** The request exactly as it will arrive on WhatsApp. */
  whatsappText: string;
  /** wa.me link with `whatsappText` prefilled; null when no number is configured. */
  whatsappHref: string | null;
  onSearchAgain: () => void;
  /** Called as the WhatsApp link opens: the run records the hand-off for the buyers' queue. */
  onHandoff?: () => void;
}

/** No match we can stand behind: say so plainly and hand the request to a person. */
export const FinderNothingFound = forwardRef<HTMLHeadingElement, FinderNothingFoundProps>(function FinderNothingFound(
  { message, whatsappText, whatsappHref, onSearchAgain, onHandoff },
  ref,
) {
  const headingId = useId();
  return (
    <motion.section
      variants={stagger(0.05)}
      initial="hidden"
      animate="visible"
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <motion.div variants={riseIn} className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MagnifyingGlass size={22} weight="duotone" aria-hidden />
        </span>
        <h2 id={headingId} ref={ref} tabIndex={-1} className="text-[22px] font-bold leading-tight outline-none">
          We couldn&apos;t find this one
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{message}</p>
      </motion.div>

      <motion.div
        variants={riseIn}
        className="flex flex-col gap-4 rounded-3xl border border-tm-green/30 bg-tm-green-bg p-5 dark:bg-tm-green/10"
      >
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-bold">A buyer can find this for you</h3>
          <p className="text-[15px] leading-relaxed text-foreground/80">
            Send the request to a Tomame buyer on WhatsApp. They search by hand, including stores we do not search
            automatically, and reply with a landed price in cedis.
          </p>
        </div>
        <figure className="rounded-2xl bg-card px-4 py-3">
          <figcaption className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Your message
          </figcaption>
          <blockquote className="mt-1 text-[15px] leading-relaxed">{whatsappText}</blockquote>
        </figure>
        <div className="flex flex-col gap-2 @md:flex-row">
          {whatsappHref && (
            <Button
              asChild
              className="h-12 rounded-xl bg-tm-green text-[15px] text-white hover:bg-tm-green-ink @md:flex-1"
            >
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={() => onHandoff?.()}>
                <WhatsappLogo size={20} weight="fill" aria-hidden />
                Ask a buyer on WhatsApp
                <span className="sr-only">(opens WhatsApp)</span>
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onSearchAgain}
            className="h-12 rounded-xl text-[15px] dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted"
          >
            <ArrowCounterClockwise weight="bold" aria-hidden />
            Search for something else
          </Button>
        </div>
      </motion.div>
    </motion.section>
  );
});
