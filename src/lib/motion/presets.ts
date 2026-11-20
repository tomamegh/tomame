import type { Transition, Variants } from "motion/react";

/**
 * The shared motion vocabulary. Every transition settles within 250 ms and
 * moves only transform and opacity, so nothing triggers layout or paint.
 *
 * Wrap a surface in `<MotionConfig reducedMotion="user">` and motion drops the
 * transforms for anyone who asks for reduced motion, keeping the fades; CSS
 * keyframes are already silenced by the guard in globals.css.
 */

/** cubic-bezier(.16, 1, .3, 1), the `--tm-ease` curve, for tweened moves. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.18,
  slow: 0.25,
} as const;

/**
 * Springs by perceived duration rather than stiffness/damping, so "how long
 * does this feel" is the number on the page.
 */
export const SPRING = {
  /** Presses, toggles, ticks landing. */
  snappy: { type: "spring", visualDuration: 0.16, bounce: 0.15 },
  /** Things entering: cards, steps, notices. */
  smooth: { type: "spring", visualDuration: 0.24, bounce: 0 },
  /** Size and position changes: reorders, expanding panels. */
  layout: { type: "spring", visualDuration: 0.25, bounce: 0.08 },
  /** A figure arriving: digits rolling, a check mark. */
  pop: { type: "spring", visualDuration: 0.22, bounce: 0.25 },
} as const satisfies Record<string, Transition>;

/** Rise and fade: the default entrance. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: SPRING.smooth },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Plain fade, for content swapping in place. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Slide in from the side, for items joining a list. */
export const slideIn: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: SPRING.smooth },
  exit: { opacity: 0, x: -8, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Scale up from nothing, for a small mark landing (a tick, a badge). */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: SPRING.pop },
  exit: { opacity: 0, scale: 0.8, transition: { duration: DURATION.fast } },
};

/** Parent of a staggered list. 40 ms per child keeps a list of six inside 250 ms. */
export function stagger(perChild = 0.04, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: perChild, delayChildren } },
  };
}

/** Pressed-button feel: a slight sink, no colour change. */
export const PRESS = { scale: 0.97 } as const;
