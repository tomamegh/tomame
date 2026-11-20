"use client";

import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PRESS, riseIn, stagger } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

import { parseBudgetInput } from "../format";

export const FINDER_EXAMPLES = [
  "PS5 Slim digital",
  "Oraimo earbuds under GH₵500",
  "Kids' scooter for a 6-year-old",
] as const;

export interface FinderRequest {
  query: string;
  budgetGhs: number | null;
}

interface FinderAskProps {
  onSubmit: (request: FinderRequest) => void;
  /** Disables the form while a run is being created. */
  pending?: boolean;
  defaultQuery?: string;
  /** False for a visitor with no address yet: the copy then promises no email. */
  notifies?: boolean;
}

export function FinderAsk({ onSubmit, pending = false, defaultQuery = "", notifies = true }: FinderAskProps) {
  const queryId = useId();
  const budgetId = useId();
  const errorId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Tell us what you are looking for, in a few words.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onSubmit({ query: trimmed, budgetGhs: parseBudgetInput(budget) });
  }

  function pickExample(example: string) {
    setQuery(example);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <motion.form
      noValidate
      onSubmit={submit}
      variants={stagger(0.05)}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 @md:px-6 @3xl:py-16"
    >
      <motion.div variants={riseIn} className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-tint px-3 py-1 text-xs font-semibold text-tm-coral-strong dark:bg-tm-coral/15 dark:text-tm-coral">
          <Sparkle size={14} weight="fill" aria-hidden />
          Price finder
        </span>
        <h1 className="text-[32px] font-extrabold leading-[1.05] @md:text-[44px]">
          <label htmlFor={queryId}>What do you want to buy?</label>
        </h1>
        <p id={hintId} className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Describe it in your own words. We search the US stores we buy from and show you the best price landed in
          Accra, in cedis.
        </p>
      </motion.div>

      <motion.div variants={riseIn} className="flex flex-col gap-3">
        <input
          ref={inputRef}
          id={queryId}
          name="query"
          type="text"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Noise-cancelling headphones"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          className={cn(
            "h-16 w-full rounded-2xl border border-border bg-card px-5 text-lg font-medium text-foreground shadow-[0_1px_2px_rgba(43,36,34,.04)] outline-none transition-[border-color,box-shadow] duration-150",
            "placeholder:font-normal placeholder:text-muted-foreground/70",
            "focus-visible:border-tm-coral focus-visible:ring-4 focus-visible:ring-tm-coral/15",
            error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
          )}
        />
        <p id={errorId} role="alert" className={cn("min-h-5 text-sm font-medium text-destructive", !error && "sr-only")}>
          {error}
        </p>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Try</span>
          <ul className="flex flex-wrap gap-2">
            {FINDER_EXAMPLES.map((example) => (
              <li key={example}>
                <motion.button
                  type="button"
                  whileTap={PRESS}
                  onClick={() => pickExample(example)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground",
                    "transition-colors duration-150 hover:border-tm-coral/40 hover:bg-tm-tint dark:hover:bg-tm-coral/10",
                    "outline-none focus-visible:ring-4 focus-visible:ring-tm-coral/20",
                    query === example && "border-tm-coral/50 bg-tm-tint dark:bg-tm-coral/10",
                  )}
                >
                  {example}
                </motion.button>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <motion.div variants={riseIn} className="flex flex-col gap-3 @md:flex-row @md:items-end">
        <div className="flex flex-col gap-1.5 @md:w-52">
          <label htmlFor={budgetId} className="text-sm font-semibold text-foreground">
            Budget <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <div className="flex h-12 items-center rounded-xl border border-border bg-card px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-tm-coral focus-within:ring-4 focus-within:ring-tm-coral/15">
            <span aria-hidden className="pr-1.5 text-[15px] font-semibold text-muted-foreground">
              GH₵
            </span>
            <input
              id={budgetId}
              name="budget"
              inputMode="numeric"
              autoComplete="off"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Any"
              aria-label="Budget in Ghana cedis, optional"
              className="tm-nums h-full w-full bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          aria-busy={pending || undefined}
          className="h-12 w-full rounded-xl text-[15px] @md:w-auto @md:flex-1"
        >
          Find the best price
          <ArrowRight weight="bold" aria-hidden />
        </Button>
      </motion.div>

      <motion.p variants={riseIn} className="text-sm leading-relaxed text-muted-foreground">
        {notifies
          ? "It takes about a minute. You can close the page; we email you the result."
          : "It takes about a minute. You can add your email on the next screen and close the page."}{" "}
        Every price includes US sales tax,
        our 4% fee and freight to Accra with customs.
      </motion.p>
    </motion.form>
  );
}
