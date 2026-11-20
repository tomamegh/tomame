"use client";

import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";

import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion/presets";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface NumberRollProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** The figure already formatted for display ("GH₵934.16"). Only its digits roll. */
  value: string;
  /** Roll in from zero on first render. Off when the figure was already on screen. */
  rollOnMount?: boolean;
}

/**
 * A formatted figure whose digits roll into place, odometer style.
 *
 * Each digit is a clipped column of 0–9 moved by transform only, sized by an
 * invisible copy of the digit in the flow, and the figure renders with
 * tabular numerals, so the text never changes width while it rolls. Digits
 * are keyed from the right so "934.16" → "1,276.53" rolls units into units.
 * Screen readers get the plain figure once.
 */
export function NumberRoll({ value, rollOnMount = true, className, ...props }: NumberRollProps) {
  const reduce = useReducedMotion();
  const chars = Array.from(value);

  return (
    <span className={cn("tm-nums relative inline-flex whitespace-nowrap", className)} {...props}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((char, i) => {
          const key = chars.length - i;
          const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
          if (digit < 0) return <span key={`c${key}`}>{char}</span>;
          return (
            <span key={`d${key}`} className="relative inline-block overflow-hidden">
              <span className="invisible">{char}</span>
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                initial={rollOnMount && !reduce ? { y: "0%" } : false}
                animate={{ y: `${-digit * 10}%` }}
                transition={reduce ? { duration: 0 } : SPRING.pop}
              >
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
